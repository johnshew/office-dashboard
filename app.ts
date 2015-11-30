

module GraphDashboard {

    export class App {
        public initialized = false;
        public identity: Kurve.Identity;
        public graph: Kurve.Graph;
        constructor() {
            this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e",
                window.location.protocol + "//" + window.location.host
                + window.location.pathname.substr(0, window.location.pathname.lastIndexOf("/") + 1)
                + "login.html");
            this.graph = new Kurve.Graph({ identity: this.identity });
            this.initialized = true;
        }
        public loginAsync(): Kurve.Promise {
            return this.identity.loginAsync();
        }
    }

    export class Controller {
        private app: App;

        public constructor(app: App) {
            this.app = app;

            $('#LoginToggle').click((e) => {
                this.ToggleLogin();
            });

        }

        public ToggleLogin(): void {
            if ($('#LoginState').text() == "Login") {
                this.app.loginAsync().then(() => {
                    if (myApp.identity.isLoggedIn()) {
                        $('#LoginState').text("Logout");
                        $('#Username').text(myApp.identity.getIdToken()["name"]);
                        this.LoadData();
                    }
                });
            } else {
                this.app.identity.logOut();
                $('#LoginState').text("Login");
            }
        }

        public LoadData(): void {
            // Assumes you are logged in.
            this.app.graph.meAsync()
                .done((user: any) => {
                    user.messagesAsync("$top=2").then((messageResults: any) => {
                        var list = $('#MailList');
                        var messages: Array<any> = messageResults.resultsPage;
                        messages.forEach((m) => {
                            list.append('<li class="list-group-item"><a href="#"><i class="glyphicon glyphicon-none"></i> ' + m.bodyPreview + '</a></li >');
                        });
                    });
                })
                .fail(() => {
                    alert("MeAsync Failed");
                });
        }
    }
}

var myApp = new GraphDashboard.App();
var myController = new GraphDashboard.Controller(myApp);


