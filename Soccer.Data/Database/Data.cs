namespace Soccer.Data.Database
{
    public record Data
        ( long? Id
        , string Key
        , long UserId
        , byte[] Value
        , string Source );
}
