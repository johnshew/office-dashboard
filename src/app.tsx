import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Utilities from './utilities';
import { Mail, Calendar} from './office';
import { Settings, SettingsValues } from './settings';


enum ShowState { Welcome, Mail, Calendar, Contacts, Notes };

interface AppProps extends React.Props<App> {
}


interface AppState {
    messages?: Kurve.Message[];
    messageIdToIndex?: Object;
    events?: Kurve.Event[];
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
        var InitialState = { messages: [], messageIdToIndex: {}, events: [], eventIdToIndex: {}, show: ShowState.Welcome, settings: { noScroll: true, inplace: false, console: false, refreshIntervalSeconds: 0 } };
        this.state = InitialState;
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

        console.log('Checking for identity redirect');
        if (this.identity.checkForIdentityRedirect()) {
            this.LoggedIn()
        }
        this.UpdateLoginState();
    }

    public render() {
        var welcome = (this.state.show == ShowState.Welcome) ? <div className="jumbotron"> <h2> { "Welcome" }</h2> <p> { "Please login to access your information" } </p> </div> : null;
        var mail = (this.state.show == ShowState.Mail) ? <Mail messages={ this.state.messages } mailboxes={["inbox", "sent items"]}/> : null;
        var calendar = (this.state.show == ShowState.Calendar) ? <Calendar events={ this.state.events } /> : null;
        return (
            <div>
                { welcome }
                { mail }
                { calendar }
                <Settings onChange={ this.handleSettingsChange } values={ this.state.settings }/>
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
                this.RefreshFromCloud(100);
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
        // https://graph.microsoft.com/v1.0/me/calendar/events?$select=subject,location,start,bodyPreview,organizer&$orderby=start/dateTime&$filter=start/dateTime gt '2016-01-20T00:00:00.0000000'
        this.me.calendarAsync("$orderby=start/dateTime&$filter=start/dateTime gt '" + now.toUTCString() + "'")
            .then((events) => {
                console.log('Got calendar.  Now rendering.');
                // calendar.data.sort(sortBy((item: Kurve.Event) => Date.parse(item.data.start.dateTime)));
                this.ProcessEvents([], {}, events);
            });
    }

    private ProcessEvents(newEvents: Kurve.Event[], idMap: Object, events: Kurve.Events) {
        events.data.map(event => {
            var index = idMap[event.data["id"]];
            if (index) {
                newEvents[index] = event; // do an update.
            } else {
                idMap[event.data["id"]] = newEvents.push(event); // add it to the list and record index.
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
        this.me.messagesAsync()
            .then((messages) => {
                console.log('Got messages.  Now rendering.');
                if (this.mounted && this.state.show === ShowState.Welcome) { this.setState({ show: ShowState.Mail }); }
                this.ProcessMessages([], {}, messages);

            });
    }

    private ProcessMessages(newList: Kurve.Message[], idMap: Object, result: Kurve.Messages) {
        result.data.map(message => {
            var index = idMap[message.data.id];
            if (index) {
                newList[index] = message; // do an update.
            } else {
                idMap[message.data.id] = newList.push(message); // add it to the list and record index.
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
        } else {
            document.getElementById("DoLogin").style.display = "inherit";
            document.getElementById("DoLogout").style.display = "none";
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

    private RefreshFromCloud(delay: number) {
        clearTimeout(this.timerHandle);
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
        this.RefreshFromCloud(2 * 60 * 1000);
    }
}


var app = ReactDOM.render(<App />, document.getElementById("App"));
window["myapp"] = app;

Utilities.Hook(window, 'open', (...args : any[]) => {
    console.log("window.open(url=" + args[0] + ")")
});
