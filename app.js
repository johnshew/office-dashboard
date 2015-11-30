var GraphDashboard;
(function (GraphDashboard) {
    var App = (function () {
        function App() {
            this.initialized = false;
            this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e", window.location.protocol + "//" + window.location.host
                + window.location.pathname.substr(0, window.location.pathname.lastIndexOf("/") + 1)
                + "login.html");
            this.graph = new Kurve.Graph({ identity: this.identity });
            this.initialized = true;
        }
        App.prototype.loginAsync = function () {
            return this.identity.loginAsync();
        };
        return App;
    })();
    GraphDashboard.App = App;
    var Controller = (function () {
        function Controller(app) {
            var _this = this;
            this.app = app;
            $('#UserDropdown').hide();
            $('#LoginToggle').click(function (e) {
                _this.ToggleLogin();
            });
        }
        Controller.prototype.ToggleLogin = function () {
            var _this = this;
            if ($('#LoginState').text() == "Login") {
                this.app.loginAsync().then(function () {
                    if (myApp.identity.isLoggedIn()) {
                        $('#LoginState').text("Logout");
                        $('#Username').text(myApp.identity.getIdToken()["name"]);
                        $('#UserDropdown').show();
                        _this.LoadData();
                    }
                });
            }
            else {
                this.app.identity.logOut();
                $('#LoginState').text("Login");
                $('#UserDropdown').hide();
            }
        };
        Controller.prototype.LoadData = function () {
            // Assumes you are logged in.
            this.app.graph.meAsync()
                .done(function (user) {
                user.messagesAsync("$top=2").then(function (messageResults) {
                    var list = $('#MailList');
                    var messages = messageResults.resultsPage;
                    messages.forEach(function (m) {
                        list.append('<li class="list-group-item"><a href="#"><i class="glyphicon glyphicon-none"></i> ' + m.bodyPreview + '</a></li >');
                    });
                });
            })
                .fail(function () {
                alert("MeAsync Failed");
            });
        };
        return Controller;
    })();
    GraphDashboard.Controller = Controller;
})(GraphDashboard || (GraphDashboard = {}));
var myApp = new GraphDashboard.App();
var myController = new GraphDashboard.Controller(myApp);
//# sourceMappingURL=app.js.map