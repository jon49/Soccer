using Proto;
using Soccer.Data.Database;

namespace Soccer.Data.Actors
{
    public record UploadedData
    ( string Key
    , byte[] Value
    , long Revision );

    public record SyncData
        ( long UserId
        , long LastId
        , string Source
        , IEnumerable<UploadedData>? UploadedData );

    public record SyncDataReturn
        ( List<NewUserData> Data
        , long LastSyncedId
        , List<IdKeyReturn> Saved);

    public class DataActor : IActor
    {
        private readonly DataDB _db;

        public DataActor(string dataDBPath)
        {
            _db = new(dataDBPath);
        }

        public Task ReceiveAsync(IContext context)
            => context.Message switch
            {
                SyncData x => SyncUserData(context, x),
                _ => Task.CompletedTask,
            };

        private async Task SyncUserData(IContext context, SyncData d)
        {
            var data = await _db!.GetNewDataCommand(userId: d.UserId, lastId: d.LastId);
            List<IdKeyReturn> saved = new List<IdKeyReturn>();
            if (d.UploadedData is { })
            {
                var toSaveData =
                    from x in d.UploadedData
                    where !data.Any(y => y.Key == x.Key && x.Revision < y.Id)
                    select new Database.Data
                        ( Id: x.Revision
                        , Key: x.Key
                        , UserId: d.UserId
                        , Value: x.Value
                        , Source: d.Source );
                saved = _db!.SaveData(toSaveData);
                data =
                    (from x in data
                     where !d.UploadedData.Any(y => y.Key == x.Key && y.Revision > x.Id)
                     select x)
                    .ToList();
            }
            var lastSyncedId = data.Select(x => x.Id).Concat(saved.Select(x => x.Id)).Max();
            context.Respond(new SyncDataReturn(Data: data, LastSyncedId: lastSyncedId, Saved: saved));
        }

    }
}
