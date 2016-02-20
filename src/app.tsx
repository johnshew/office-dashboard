import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { Mail, Calendar} from './office';
import { Settings, SettingsValues } from './settings';

function sortBy(key?: (any) => any, reverse?: boolean) {
    var direction = !reverse ? 1 : -1;
    return (a: any, b: any) => {
        var x = key(a), y = key(b);
        return direction * ((x as any > y as any) - (y as any > x as any));
    }
}

interface AppProps extends React.Props<App> {
}

enum ShowState { Welcome, Mail, Calendar, Contacts, Notes };

interface AppState {
    messages?: Kurve.Message[];
    messageIdToIndex?: Object;
    events?: Kurve.Event[];
    eventIdToIndex?: Object;
    show?: ShowState;
    settings? : SettingsValues;
}

class App extends React.Component<AppProps,AppState> {
    private identity: Kurve.Identity;
    private graph: Kurve.Graph;
    private me: Kurve.User;
    private eventIdToIndex: {};

    private loginNewWindow: boolean;
    private timerHandle: any;

    constructor() {
        super();
        console.log('App initializing');
        this.state = { messages: [], messageIdToIndex: {}, events: [], eventIdToIndex: {}, show: ShowState.Welcome, settings : { noScroll: true, inplace : false, console : false, refreshIntervalSeconds : 0 } };

        var here = document.location;
        this.identity = new Kurve.Identity("b8dd3290-662a-4f91-92b9-3e70fbabe04e",
            here.protocol + '//' + here.host + here.pathname.substring(0, here.pathname.lastIndexOf('/') + 1) + '../public/login.html');
        this.graph = new Kurve.Graph({ identity: this.identity });
        this.me = null;

        var params = document.location.search.replace(/.*?\?/, "").split("&").map(function (kv) { return kv.split('='); }).reduce(function (prev, kva) { prev[kva[0]] = (!kva[1]) ? true : kva[1]; return prev }, {});

        this.loginNewWindow = !window["forceInPlaceLogin"] && !params["inplace"];
        console.log('In place login is ' + !this.loginNewWindow);

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
        var mail = (this.state.show == ShowState.Mail) ? <Mail data={ this.state.messages } mailboxes={["inbox", "sent items"]}/> : null;
        var calendar = (this.state.show == ShowState.Calendar) ? <Calendar data={ this.state.events } /> : null;
        return (
            <div>
                { welcome }
                { mail } 
                { calendar }
                <Settings onChange={ (v)=> { console.log(JSON.stringify(v)); this.setState({ settings: v})} } values={ this.state.settings }/>
            </div>
            );
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
                this.ProcessAdditionalEvents([], {}, events);
            });
    }

    private ProcessAdditionalEvents(newEvents: Kurve.Event[], idMap: Object, events: Kurve.Events) {
        events.data.map((event) => {
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
                this.ProcessAdditionalEvents(newEvents, idMap, moreEvents);
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
                this.ProcessAdditionalMessages([], {}, messages);
                
            });
    }

    private ProcessAdditionalMessages(newList: Kurve.Message[], idMap: Object, result: Kurve.Messages) {
        result.data.map((item) => {
            var index = idMap[item.data["id"]];
            if (index) {
                newList[index] = item; // do an update.
            } else {
                idMap[item.data["id"]] = newList.push(item); // add it to the list and record index.
            }
        });

        this.setState({ messages: newList, messageIdToIndex: idMap });
        if (newList.length < 40 && result.nextLink) {
            result.nextLink().then((moreEvents) => {
                this.ProcessAdditionalMessages(newList, idMap, moreEvents);
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
        this.setState({ show: ShowState.Mail });                
        this.GetMe();
    }

    public IsLoggedIn(): boolean {
        this.StopRefreshFromCloud();
        return this.identity.isLoggedIn();
    }

    public Login() {
        console.log('Login called');
        if (this.loginNewWindow) {
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

    private RefreshFromCloud(delay : number) {
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


class Storage {
    constructor() { }
    public setItem(key: string, data: any) {
        if (localStorage) {
            try {
                localStorage.setItem(key, JSON.stringify({ data: data }));
            }
            catch (e) {
                console.log("localStorage error " + e);
            }
        }
    }

    public static getItem(key: string) : any {
        if (localStorage) {
            try {
                var data = JSON.parse(localStorage.getItem(key));
                return data && data.data;
            }
            catch (e) {
                console.log('localStorage read error ' + e);
            }
        }
        return null;
    }
}

export class Tools {

    public static Hook(rootObject: any, functionToHook: string, hookingFunction: (...optionalParams: any[]) => void): void {
        var previousFunction = rootObject[functionToHook];

        rootObject[functionToHook] = (...optionalParams: any[]) => {
            hookingFunction(optionalParams);
            previousFunction.apply(rootObject, optionalParams);
        }
        return previousFunction;
    }


    public static CreateCookie(name: string, value: string, days: number): void {
        var expires: string;
        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        } else {
            expires = "";
        }

        document.cookie = name + "=" + value + expires + "; path=/";
    }

    public static ReadCookie(name: string): string {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') {
                c = c.substring(1, c.length);
            }

            if (c.indexOf(nameEQ) === 0) {
                return c.substring(nameEQ.length, c.length);
            }
        }
        return "";
    }


}

var app = ReactDOM.render(<App />, document.getElementById("App"));
window["myapp"] = app;

Tools.Hook(window, 'open', (args) => {
    console.log("window.open(url=" + args[0] + ")")
});
