using JFN.Utilities;
using Microsoft.Data.Sqlite;
using DB = JFN.Utilities.Database;
using D = Soccer.Data.Database.Table.DataTable;

namespace Soccer.Data.Database
{
    public record NewUserData
        ( long Id
        , string Key
        , byte[] Value );

    public record struct IdKeyReturn
        ( long Id
        , string Key );

    public class DataDB
    {
        private readonly SqliteConnection _readOnlyConnection;
        private readonly SqliteConnection _readWriteConnection;

        public DataDB(string dbPath)
        {
            var connectionString = $"Data Source={dbPath}";
            using var readWriteCreateConnection = new SqliteConnection($"{connectionString};Mode=ReadWriteCreate;");
            UpdateDatabase(readWriteCreateConnection);
            _readWriteConnection = new SqliteConnection($"{connectionString};Mode=ReadWrite;");
            _readWriteConnection.Open();

            _readOnlyConnection = new SqliteConnection($"{connectionString};Mode=ReadOnly;");
            _readOnlyConnection.Open();
        }

        private void UpdateDatabase(SqliteConnection readWriteCreateConnection)
        {
            readWriteCreateConnection.Open();
            DB.ExecuteCommand(readWriteCreateConnection, commandCreateDatabase);
            var lastMigration = (int)(DB.ExecuteCommand<long?>(readWriteCreateConnection, $@"SELECT LastMigration FROM Migration WHERE Id = 0;") ?? 0);
            if (lastMigration == migrations.Length)
            {
                return;
            }
            foreach(var migration in migrations.Skip(lastMigration))
            {
                if (migration is { })
                {
                    DB.ExecuteCommand(readWriteCreateConnection, migration);
                }
            }
            DB.ExecuteCommand(readWriteCreateConnection, $@"INSERT INTO Migration (Id, LastMigration) VALUES (0, {migrations.Length}) ON CONFLICT (Id) DO UPDATE SET LastMigration = {migrations.Length};");
            readWriteCreateConnection.Close();
        }

        private static readonly string _createDataCommand = $@"
INSERT INTO {D.Table}
       ({D.Key}, {D.Source}, {D.UserId}, {D.Value})
VALUES ({D._Key}, {D._Source}, {D._UserId}, {D._Value})
RETURNING {D.Id}, {D.Key};";
        public List<IdKeyReturn> SaveData(IEnumerable<Data> data)
        {
            var idKey = new List<IdKeyReturn>();
            DB.BulkInsertWithReturn(
                connection: _readWriteConnection,
                sql: _createDataCommand,
                map: x => idKey.Add(new((long)x[D.Id], x[D.Key] as string ?? "")),
                data.Select(x => new DBParams[]
                {
                    new(Name: D._Key, x.Key),
                    new(Name: D._Source, x.Source),
                    new(Name: D._UserId, x.UserId),
                    new(Name: D._Value, x.Value),
                }));
            return idKey;
        }

        private static readonly string _getDataCommand = $@"
WITH Duplicates AS (
	SELECT *, ROW_NUMBER() OVER (PARTITION BY {D.UserId}, {D.Key} ORDER BY {D.Id} DESC) DupNum
	FROM {D.Table}
    WHERE {D.Id} > {D._Id}
      AND {D.UserId} = {D._UserId}
)
SELECT d.{D.Key}, d.{D.Value}, d.{D.Id}
FROM Duplicates d
WHERE DupNum = 1;";
        public async Task<List<NewUserData>> GetNewDataCommand(long userId, long lastId)
        {
            var list = new List<NewUserData>();
            await DB.ExecuteCommandAsync(
                _readOnlyConnection,
                _getDataCommand,
                x => list.Add(
                    new( Id: (long)x[D.Id],
                         Key: x[D.Key] as string ?? "",
                         Value: x[D.Value] as byte[] ?? Array.Empty<byte>())),
                new DBParams(Name: D._UserId, Value: userId),
                new DBParams(Name: D._Id, Value: lastId));
            return list;
        }

        private static readonly string commandCreateDataTable = $@"
CREATE TABLE IF NOT EXISTS {D.Table} (
    {D.Id} INTEGER NOT NULL PRIMARY KEY,
    {D.UserId} INTEGER NOT NULL,
    {D.Key} TEXT NOT NULL,
    {D.Source} TEXT NOT NULL,
    {D.Value} BLOB NULL );
CREATE UNIQUE INDEX IF NOT EXISTS idx_fetch ON {D.Table} ({D.Id}, {D.UserId}, {D.Key});";

        private static readonly string commandCreateDatabase = $@"
{commandCreateDataTable}
CREATE TABLE IF NOT EXISTS Migration (Id INTEGER NOT NULL, LastMigration INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_migration_id ON Migration (Id);";

        private static readonly string?[] migrations = Array.Empty<string?>();

    }
}
