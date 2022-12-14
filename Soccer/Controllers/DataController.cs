using Microsoft.AspNetCore.Mvc;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Soccer.Data;
using Soccer.Data.Actors;

namespace Soccer.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DataController : BaseUserController
    {
        [HttpPost]
        public async Task<SyncDataReturnDto> Post([FromBody] SyncDataDto syncData, [FromServices] DataAction action)
        {
            var result = await action.SyncData(new SyncData
                ( UserId: UserId
                , LastId: syncData.LastSyncedId ?? 0
                , Source: Session ?? "Unknown"
                , UploadedData:
                    from x in syncData.Data
                    where !string.IsNullOrEmpty(x.Key)
                    select new UploadedData(x.Key ?? "", JsonSerializer.SerializeToUtf8Bytes(x.Data), x.Timestamp) ));
            return new(
                LastSyncedId: result.LastSyncedId,
                Data:
                    from x in result.Data
                    select new[] { x.Key, JsonSerializer.Deserialize<object>(x.Value) },
                Saved:
                    from x in result.Saved
                    select new[] { (object)x.Key, x.Id } );
        }
    }

    public class SyncDataDto
    {
        [Required, Range(0, long.MaxValue, ErrorMessage = "Valid last ID required.")]
        public long? LastSyncedId { get; set; } = 0;
        public DataDto?[] Data { get; set; } = Array.Empty<DataDto?>();
    }

    public class DataDto
    {
        public string? Key { get; set; }
        public object? Data { get; set; }
        public long Timestamp { get; set; } = 0;
    }

    public record SyncDataReturnDto
        ( IEnumerable<object[]> Data
        , IEnumerable<object[]> Saved
        , long LastSyncedId );

}
