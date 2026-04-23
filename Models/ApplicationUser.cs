using Microsoft.AspNetCore.Identity;

namespace LiveChatApp.Models
{
    public class ApplicationUser:IdentityUser
    {
        public string? DisplayName {get;set;}
    }
}