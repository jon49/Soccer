using JFN.User;
using JFN.UserAuthenticationWeb.Middleware;
using JFN.UserAuthenticationWeb.Settings;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.HttpOverrides;
using Proto;
using System.Diagnostics;
using Soccer.Data;
using Soccer.Models;
using static JFN.Utilities.Paths;

namespace Soccer
{
    public class Startup
    {
        private readonly IConfiguration Configuration;

        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public void ConfigureServices(IServiceCollection services)
        {
            services
                .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
                .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
                {
                    options.LoginPath = "/login";
                    options.LogoutPath = "/login?handler=logout";
                    options.Cookie.Name = "user_session";
                    options.SlidingExpiration = true;
                    options.Cookie.HttpOnly = true;
                    options.Cookie.SameSite = SameSiteMode.Strict;
                });
            services.AddRazorPages(options =>
            {
                options.Conventions.AuthorizeFolder("/app");
                options.Conventions.AuthorizeFolder("/api");
            });
            services.Configure<ForwardedHeadersOptions>(options =>
            {
                options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
            });
            services.AddControllers();
            services.AddMemoryCache();

            services.Configure<UserSettings>(Configuration);
            services.Configure<AdminSetting>(Configuration);
            services.AddSingleton<ActorSystem>();

            var appDir = "soccer";
            services.AddSingleton(x =>
                new DataAction(x.GetRequiredService<ActorSystem>(), Path.Combine(GetAppDir(appDir), "data.db")));
            services.AddSingleton(x =>
                new User
                ( x.GetRequiredService<ActorSystem>(), new OneForOneStrategy((pid, reason) =>
                    {
                        Debug.WriteLine(reason);
                        return SupervisorDirective.Resume;
                    }, 1, null), Path.Combine(GetAppDir(appDir), "user.db")
                ));
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }
            else
            {
                app.UseForwardedHeaders();
                app.UseHsts();
            }

            if (env.IsDevelopment())
            {
                var options = new DefaultFilesOptions();
                options.DefaultFileNames.Clear();
                options.DefaultFileNames.Add("index.html");
                app.UseDefaultFiles(options);
                app.UseStaticFiles();
            }

            app.UseRouting();

            app.UseAuthentication();
            app.UseUserAuthenticationValidationMiddleware();
            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllers();
                endpoints.MapRazorPages();
            });
        }


    }
}
