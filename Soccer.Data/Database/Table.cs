namespace Soccer.Data.Database
{
    public static class Table
    {
        public static class DataTable
        {
            public static readonly string Table = nameof(Data);

            public static readonly string Id = nameof(Data.Id);
            public static readonly string _Id = $"${nameof(Data.Id)}";

            public static readonly string Key = nameof(Data.Key);
            public static readonly string _Key = $"${nameof(Data.Key)}";

            public static readonly string UserId = nameof(Data.UserId);
            public static readonly string _UserId = $"${nameof(Data.UserId)}";

            public static readonly string Value = nameof(Data.Value);
            public static readonly string _Value = $"${nameof(Data.Value)}";

            public static readonly string Source = nameof(Data.Source);
            public static readonly string _Source = $"${nameof(Data.Source)}";

        }
    }
}
