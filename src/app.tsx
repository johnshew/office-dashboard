import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Utilities from './utilities';
import { Mail, Calendar} from './office';
import { Settings, SettingsValues } from './settings';
import { About } from './about';

const loadingMessageStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    right: 0,
    padding: 10,
    fontWeight: 'bold'
};

enum ShowState { Welcome, Mail, Calendar, Contacts, Notes };

interface AppProps extends React.Props<App> {
}

interface AppState {
    fetchingMail? : Boolean;
    fetchingCalendar? : Boolean;
    messages?: Kurve.MessageDataModel[];
    messageIdToIndex?: Object;
    events?: Kurve.EventDataModel[];
    eventIdToIndex?: Object;
    show?: ShowState;
    settings?: SettingsValues;
}

class App extends React.Component<AppProps, AppState> {
    private identity: Kurve.Identity;
    private graph: Kurve.Graph;
    private me: Kurve.User;
    // private eventIdToIndex: {};  now in state
    private mounted = false;
    private storage: Utilities.Storage;

    // private loginNewWindow: boolean;
    private timerHandle: any;

    constructor() {
        super();
        console.log('App initializing');

        this.state = {
            fetchingMail: false,
            fetchingCalendar: false,
            messages: [],
            messageIdToIndex: {},
            events: [],
            eventIdToIndex: {},
            show: ShowState.Welcome,
            settings: {
                scroll: false,
                inplace: true,
                testData: false,
                console: false,
                refreshIntervalSeconds: 5*60
            }
        };

        Utilities.ObjectAssign(this.state.settings, Utilities.Storage.getItem("settings")); // replace defaults with anything we find in storage.

        var here = document.location;
        this.identity = new Kurve.Identity({
            clientId: "b8dd3290-662a-4f91-92b9-3e70fbabe04e",
            tokenProcessingUri: here.protocol + '//' + here.host + here.pathname.substring(0, here.pathname.lastIndexOf('/') + 1) + '../public/login.html',
            version: null
        });
        this.graph = new Kurve.Graph({ identity: this.identity });
        this.me = null;

        var params = document.location.search.replace(/.*?\?/, "").split("&").map(function(kv) { return kv.split('='); }).reduce(function(prev, kva) { prev[kva[0]] = (!kva[1]) ? true : kva[1]; return prev }, {});

        if (window["forceInPlaceLogin"] === true || params["inplace"] === true) { this.state.settings.inplace = true; } // Override settings
        if (window["forceDebugConsole"] === true || params["console"] === true) { this.state.settings.console = true; }
        this.CheckConsole();

        console.log('Inline login is ' + this.state.settings.inplace);
        console.log('Local console is ' + this.state.settings.console);

        document.getElementById("DoLogin").onclick = (e) => this.Login();
        document.getElementById("DoLogout").onclick = (e) => this.Logout();
        document.getElementById("ShowMail").onclick = (e) => this.ShowMail();
        document.getElementById("ShowCalendar").onclick = (e) => this.ShowCalendar();
        document.getElementById("ShowContacts").onclick = (e) => this.ShowContacts();
        document.getElementById("ShowNotes").onclick = (e) => this.ShowNotes();
        document.getElementById("RefreshCurrentView").onclick = (e) => this.RefreshCurrentView();

        console.log('Checking for identity redirect');
        if (this.identity.checkForIdentityRedirect()) {
            this.LoggedIn()
        }
        this.UpdateLoginState();
    }

    public render() {
        var welcome = (this.state.show == ShowState.Welcome) ? <div className="jumbotron"> <h2> { "Welcome" }</h2> <p> { "Please login to access your information" } </p> </div> : null;
        var mail = (this.state.show == ShowState.Mail) ? <Mail messages={ this.state.messages } scroll={ this.state.settings.scroll } mailboxes={["inbox", "sent items"]}/> : null;
        var calendar = (this.state.show == ShowState.Calendar) ? <Calendar events={ this.state.events } scroll={ this.state.settings.scroll } /> : null;
        var loadingMessage = (this.state.fetchingMail || this.state.fetchingCalendar) ? <div style={ loadingMessageStyle }>Loading...</div> : null;

        return (
            <div>
                { loadingMessage }
                { welcome }
                { mail }
                { calendar }
                <Settings onChange={ this.handleSettingsChange } values={ this.state.settings }/>
                <About/>
            </div>
        );
    }

    public componentDidMount() {
        console.log("App mounted")
        this.mounted = true;
    }

    public componentWillUnmount() {
        console.log("App unmounted")
        this.mounted = false;
    }

    handleSettingsChange = (updated: SettingsValues) => {
        console.log(JSON.stringify(updated));
        var settings = Utilities.ObjectAssign({}, this.state.settings, updated);
        this.setState({ settings: settings });
        Utilities.Storage.setItem("settings", settings);
        this.CheckConsole();
        this.RefreshFromCloud(updated.refreshIntervalSeconds);
    }

    public CheckConsole()
    {
        if (this.state.settings.console && !Utilities.LocalConsole) { Utilities.LocalConsoleInitialize(); }
    }

    public GetMe(): Kurve.User {
        if (this.me) {
            return this.me;
        }
        console.log('Getting me');
        this.graph.meAsync()
            .then((result) => {
                console.log("Got me.");
                this.me = result;
                this.RefreshFromCloud(1); // do it now, note that zero would mean never.
                return this.UpdateProfileInfo();
            })
            .fail((error) => {
                console.log("Get me failed.");
            });
        return null;
    }

    public GetCalendarEvents() {
        if (!this.me) {
            this.GetMe();
            return;
        }
        console.log('Now getting calendar events.');
        var now = new Date(Date.now())
        var today = new Date();
        var nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate()+7);
        this.setState({ fetchingCalendar: true });

        this.me.calendarViewAsync("$orderby=start/dateTime&startDateTime=" + now.toISOString() + "&endDateTime=" + nextWeek.toISOString())
            .then((events) => {
                console.log('Got calendar.  Now rendering.');
                this.ProcessEvents([], {}, events);
                this.setState({ fetchingCalendar: false });
            })
            .fail((error) => {
                this.setState({ fetchingCalendar: false });
            });
    }

    private ProcessEvents(newEvents: Kurve.EventDataModel[], idMap: Object, events: Kurve.Events) {
        events.data.map(event => {
            var index = idMap[event.data["id"]];
            if (index) {
                newEvents[index] = event.data; // do an update.
            } else {
                idMap[event.data["id"]] = newEvents.push(event.data); // add it to the list and record index.
            }
        });
        this.setState({ events: newEvents, eventIdToIndex: idMap });  // We have new data so update state and it will cause a render.
        if (newEvents.length < 40 && events.nextLink) {
            events.nextLink().then((moreEvents) => {
                this.ProcessEvents(newEvents, idMap, moreEvents);
            });
        }
    }

    public GetMessages() {
        if (!this.me) {
            this.GetMe();
            return;
        }
        console.log('Now getting messages.');
        this.setState({ fetchingMail: true });

        this.me.messagesAsync()
            .then((messages) => {
                console.log('Got messages.  Now rendering.');
                if (this.mounted && this.state.show === ShowState.Welcome) { this.setState({ show: ShowState.Mail }); }
                this.ProcessMessages([], {}, messages);
                this.setState({ fetchingMail: false });
            }).fail((error) => {
                this.setState({ fetchingMail: false });
            });
    }

    private ProcessMessages(newList: Kurve.MessageDataModel[], idMap: Object, result: Kurve.Messages) {
        result.data.map(message => {
            var index = idMap[message.data.id];
            if (index) {
                newList[index] = message.data; // do an update.
            } else {
                idMap[message.data.id] = newList.push(message.data); // add it to the list and record index.
            }
        });

        this.setState({ messages: newList, messageIdToIndex: idMap });
        if (newList.length < 40 && result.nextLink) {
            result.nextLink().then(moreMessages => {
                this.ProcessMessages(newList, idMap, moreMessages);
            });
        }
    }

    public UpdateLoginState() {
        if (this.identity.isLoggedIn()) {
            document.getElementById("DoLogin").style.display = "none";
            document.getElementById("DoLogout").style.display = "inherit";
            document.getElementById("RefreshCurrentView").style.display = "inherit";
        } else {
            document.getElementById("DoLogin").style.display = "inherit";
            document.getElementById("DoLogout").style.display = "none";
            document.getElementById("RefreshCurrentView").style.display = "none";
        }
    }

    public LoggedIn() {
        console.log('Successful login.');
        this.UpdateLoginState();
        if (this.mounted) {
            this.setState({ show: ShowState.Mail });
        }
        this.GetMe();
    }

    public IsLoggedIn(): boolean {
        return this.identity.isLoggedIn();
    }

    public Login() {
        console.log('Login called');
        if (!this.state.settings.inplace) {
            this.identity.loginAsync()
                .then(() => {
                    this.LoggedIn();
                });
        } else {
            this.identity.loginNoWindow((error) => {
                console.log('LoginNoWindow failed.');
            }); // no .then since it will be caught when the page reloads.
        }
    }

    public Logout() {
        this.identity.logOut();
        this.UpdateLoginState();
    };

    private handleMultiChange = (e) => {
        console.log(JSON.stringify(e));
    }

    private ShowMail() {
        this.setState({ show: ShowState.Mail });
    }

    private ShowCalendar() {
        this.setState({ show: ShowState.Calendar });
    }

    private ShowContacts() {

    }

    private ShowNotes() {

    }

    private UpdateProfileInfo() {
        document.querySelector("#UsernameText").textContent = this.me.data.displayName;
        return this.me.profilePhotoValueAsync()
            .then((profilePhoto) => {
                return this.ShowProfilePicture(profilePhoto);
            })
            .fail((err) => {
                console.log("Get profilePhotoValueAsync failed.")
            });
    }

    private ShowProfilePicture(profilePhoto) {
        var profileImage = document.querySelector(".nav .profile-picture");
        var profileIcon = document.querySelector(".nav .profile-icon");
        profileImage.setAttribute("src", window.URL.createObjectURL(profilePhoto));
        profileIcon.setAttribute("style", "display: none");
        profileImage.setAttribute("style", "display: block");
    }

    private RefreshFromCloud(delay: number) {
        console.log("Setting next refresh to " + delay + "ms");
        clearTimeout(this.timerHandle);
        if (delay === 0) return; // Zero means stop refresh
        this.timerHandle = setTimeout(() => {
            this.RefreshTick();
        }, delay);
    }

    private StopRefreshFromCloud() {
        clearTimeout(this.timerHandle);
    }

    private RefreshTick() {
        console.log("RefreshTick");
        if (this.IsLoggedIn()) {
            this.GetMessages();
            this.GetCalendarEvents();
        }
        this.RefreshFromCloud(this.state.settings.refreshIntervalSeconds * 1000);
    }

    private RefreshCurrentView() {
        if (this.IsLoggedIn()) {
            switch (this.state.show) {
                case ShowState.Mail:
                    this.GetMessages();
                    break;
                case ShowState.Calendar:
                    this.GetCalendarEvents();
                    break;
            }
        }
    }
}

var app = ReactDOM.render(<App />, document.getElementById("App"));
window["myapp"] = app;

Utilities.Hook(window, 'open', (...args : any[]) => {
    console.log("window.open(url=" + args[0] + ")")
});
