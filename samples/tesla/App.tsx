import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Kurve from 'kurvejs';
import * as Utilities from './Utilities';
import TokenLocalStorage from './TokenStorage';
import About from './About';
import { Settings, SettingsValues } from './Settings';
import Mail from '../../src/Mail';
import Calendar from '../../src/Calendar';

const excludedMailFolderNames = ['Archive', 'Drafts', 'Sent Items', 'Deleted Items', 'Clutter', 'Junk Email'];

const loadingMessageStyle: React.CSSProperties = {
    position: 'fixed',
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
    excludedMailFolders?: string[];
    messages?: Kurve.MessageDataModel[];
    selectedMessage?: Kurve.MessageDataModel;
    messageIdToIndex?: Object;
    events?: Kurve.EventDataModel[];
    selectedEvent?: Kurve.EventDataModel;
    eventIdToIndex?: Object;
    show?: ShowState;
    settings?: SettingsValues;
}

class App extends React.Component<AppProps, AppState> {
    private identity: Kurve.Identity;
    private graph: Kurve.Graph;
/*
    private me: Kurve.UserDataModel;
*/
    // private eventIdToIndex: {};  now in state
    private mounted = false;
    private storage: Utilities.Storage;
    private tokenStorage: TokenLocalStorage;
    
    // private loginNewWindow: boolean;
    private timerHandle: any;

    constructor() {
        super();
        console.log('App initializing');

        this.state = {
            fetchingMail: false,
            fetchingCalendar: false,
            excludedMailFolders: [],
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

        this.tokenStorage = new TokenLocalStorage();

        var here = document.location;
        this.identity = new Kurve.Identity({
            clientId: "b8dd3290-662a-4f91-92b9-3e70fbabe04e",   // v1
            //clientId: "bdb197ab-5178-4609-af0d-76d8b3b796a2",   // v2
            tokenProcessingUri: here.protocol + '//' + here.host + here.pathname.substring(0, here.pathname.lastIndexOf('/') + 1) + '../public/login.html',
            version: Kurve.EndPointVersion.v1,
            mode: Kurve.Mode.Client,
            tokenStorage: this.tokenStorage
        });
        this.graph = new Kurve.Graph({ identity: this.identity }, Kurve.Mode.Client);
/*
        this.me = null;
*/

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
            window.location.hash = '#';
            this.LoggedIn()
        } else if (this.tokenStorage.hasTokens()) {
            this.Login();
        }
    }

    private renderMail() {
        return <Mail
            messages={this.state.messages}
            selectedMessage={this.state.selectedMessage}
            onSelect={this.SelectMessage}
            scroll={this.state.settings.scroll}
        />
    }

    public render() {
        var welcome = (this.state.show == ShowState.Welcome) ? <div className="jumbotron"> <h2> { "Welcome" }</h2> <p> { "Please login to access your information" } </p> </div> : null;
        var mail = (this.state.show == ShowState.Mail) ? this.renderMail() : null;
        var calendar = (this.state.show == ShowState.Calendar) ? <Calendar events={ this.state.events } selectedEvent = { this.state.selectedEvent } onSelect = { this.SelectEvent } scroll={ this.state.settings.scroll } /> : null;
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

/*
    public GetMe(): Kurve.UserDataModel {
        if (this.me) {
            return this.me;
        }
        console.log('Getting me');
        this.graph.me.GET()
            .then((result) => {
                console.log("Got me.");
                this.me = result;
                this.RefreshFromCloud(1); // do it now, note that zero would mean never.
            })
            .fail((error) => {
                console.log("Get me failed.");
            });
        return null;
    }
*/
    public GetCalendarEvents() {
/*
        if (!this.me) {
            this.GetMe();
            return;
        }
*/
        console.log('Now getting calendar events.');
        var now = new Date(Date.now())
        var today = new Date();
        var nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate()+7);
        this.setState({ fetchingCalendar: true });

        this.graph.me.calendarView.GetEvents(new Kurve.OData()
            .odata(Kurve.CalendarView.dateRange(today, nextWeek))
            .select("attendees", "bodyPreview","end", "id", "location", "organizer", "subject", "start")
            .orderby("start/dateTime")
            .expand("attachments($select=id,isInline)")
        ).then(events => {
            this.ProcessEvents([], {}, events);
            console.log('Got calendar.  Now rendering.');
            this.setState({ fetchingCalendar: false });
        });
    }

    private ProcessEvents(newEvents: Kurve.EventDataModel[], idMap: Object, events: Kurve.GraphCollection<Kurve.EventDataModel, Kurve.CalendarView, Kurve.Event>) {
        events.value.forEach(event => {
            var index = idMap[event.id];
            if (index) {
                newEvents[index] = event; // do an update.
            } else {
                idMap[event.id] = newEvents.push(event); // add it to the list and record index.
            }
        });
        this.setState({ events: newEvents, eventIdToIndex: idMap });  // We have new data so update state and it will cause a render.
        if (newEvents.length < 40 && events._next)
            events._next().then(nextEvents => this.ProcessEvents(newEvents, idMap, nextEvents));
    }

    public GetMessages() {
/*
        if (!this.me) {
            this.GetMe();
            return;
        }
*/
        this.setState({ fetchingMail: true });
        console.log('Now getting messages.');
        this.graph.me.messages.GetMessages(new Kurve.OData()
            .select("parentFolderId", "bccRecipients", "bodyPreview", "ccRecipients", "id", "importance", "receivedDateTime", "sender", "subject", "toRecipients") 
            .expand("attachments($select=id,isInline)")
            .top(60)
        ).then(messages => {
            this.ProcessMessages([], {}, messages);
            if (this.mounted && this.state.show === ShowState.Welcome) { this.setState({ show: ShowState.Mail }); }
            console.log('Got messages.  Now rendering.');
            this.setState({ fetchingMail: false });
        });
    }

    public SelectMessage = (messageId: string) => {
        console.log("Selecting Message", messageId);
        var messages = this.state.messages.filter(m => m.id === messageId);
        if (messages.length == 0)
            return;

        // First render the basic metadata (including body preview)
        this.setState({ selectedMessage: messages[0] });

        // Next, get the rest of the message metadata and full body text
        this.graph.me.messages.$(messageId).GetMessage()
        .then(responseMessage => {
            this.setState({ selectedMessage: responseMessage });
            // Finally, load up the inline images. We use messages[0] because it has the list of attachment ids
            messages[0].attachments
                .filter(a => a.isInline)
                .forEach(attachment =>
                    responseMessage._context.attachments.$(attachment.id)
                    .GetAttachment()
                    .then(responseAttachment => {
//                      if (attachment.getType() === Kurve.AttachmentType.fileAttachment) {
                            // keep state immutable by creating a new message with new attachments for every re-render
                            var message = Utilities.ObjectAssign({}, this.state.selectedMessage, { attachments: (this.state.selectedMessage.attachments || []).slice() })
                            message.attachments.push(responseAttachment);
                            this.setState({ selectedMessage: message });
  //                    }
                    })
                    .fail(error => console.log('Could not load the attachment.', error))
                )
        })
        .fail(error => console.log('Could not load the message.', error))
    }

    public SelectEvent = (eventId: string) => {
        console.log("Selecting Event", eventId);
        var events = this.state.events.filter(e => e.id === eventId);
        if (events.length == 0)
            return;

        // First render the basic metadata (including body preview)
        this.setState({ selectedEvent: events[0] });

        // Next, get the rest of the event metadata and full body text
        this.graph.me.events.$(eventId).GetEvent()
        .then(event => this.setState({ selectedEvent: event }))
/*
        .then(() =>
            // Finally, load up the inline images

            events[0].attachments
                .filter(a => a.isInline)
                .forEach(attachment =>
                    this.me.messageAttachmentAsync(eventId, attachment.id)
                    .then(attachment => {
                        if (attachment.getType() === Kurve.AttachmentType.fileAttachment) {
                            // keep state immutable by creating a new message with new attachments for every re-render
                            var message = Utilities.ObjectAssign({}, this.state.selectedMessage, { attachments: (this.state.selectedMessage.attachments || []).slice() })
                            message.attachments.push(attachment.data);
                            this.setState({ selectedMessage: message });
                        }
                    })
                    .fail(error => console.log('Could not load the attachment.', error))
                )
        )
*/
        .fail(error => console.log('Could not load the event.', error))
    }

    private ProcessMessages(newList: Kurve.MessageDataModel[], idMap: Object, messages:Kurve.GraphCollection<Kurve.MessageDataModel, Kurve.Messages, Kurve.Message>) {
        messages.value.forEach(message => {
            if (this.state.excludedMailFolders.indexOf(message.parentFolderId) == -1) {
                var index = idMap[message.id];
                if (index) {
                    newList[index] = message; // do an update.
                } else {
                    idMap[message.id] = newList.push(message); // add it to the list and record index.
                }
            }
        });

        this.setState({ messages: newList, messageIdToIndex: idMap });
        if (newList.length < 40 && messages._next)
            messages._next().then(nextMessages => this.ProcessMessages(newList, idMap, nextMessages));
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
        console.log("Successful login");
        var idtoken:Kurve.IdToken = this.identity.getIdToken();
        if (idtoken && idtoken.UPN) {
            var username = idtoken.UPN.replace(/[,;=| ]+/g, "_");
            console.log("Username", username);
            window["appInsights"].setAuthenticatedUserContext(username);
        }
        this.UpdateLoginState();
        if (this.mounted) {
            this.setState({ show: ShowState.Mail });
        }
        
        this.graph.me.mailFolders.GetMailFolders().then(mailFolders => {
            var filteredFolders = mailFolders.value
                .filter(mailFolder =>
                    excludedMailFolderNames.some(excludedFolderName => excludedFolderName == mailFolder.displayName))
                .map(mailFolder => mailFolder.id);
            this.setState({ excludedMailFolders: filteredFolders });
            this.RefreshFromCloud(1); // do it now, note that zero would mean never.
        });

/*
        this.GetMe();
*/
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
