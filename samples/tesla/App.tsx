import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Utilities from './Utilities';
import TokenLocalStorage from './TokenStorage';
import About from './About';
import { Settings, SettingsValues } from './Settings';
import Mail from '../../src/Mail';
import Calendar from '../../src/Calendar';

const excludedMailFolders = ['Drafts', 'Sent Items', 'Deleted Items', 'Clutter', 'Junk Email'];

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
    fetchingMailFolders? : Boolean;
    selectedMailFolders?: Kurve.MailFolderDataModel[];
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
    private me: Kurve.User;
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
            fetchingMailFolders: false,
            selectedMailFolders: [],
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
            clientId: "b8dd3290-662a-4f91-92b9-3e70fbabe04e",
            tokenProcessingUri: here.protocol + '//' + here.host + here.pathname.substring(0, here.pathname.lastIndexOf('/') + 1) + '../public/login.html',
            version: null,
            tokenStorage: this.tokenStorage
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

        this.me.calendarViewAsync("$select=attendees,bodyPreview,end,id,location,organizer,subject,start&$expand=attachments($select=id,isInline)&$orderby=start/dateTime&startDateTime=" + now.toISOString() + "&endDateTime=" + nextWeek.toISOString())
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
            var index = idMap[event.data.id];
            if (index) {
                newEvents[index] = event.data; // do an update.
            } else {
                idMap[event.data.id] = newEvents.push(event.data); // add it to the list and record index.
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

        this.setState({ fetchingMail: true });
        this.GetMailFolders()
            .then(() => {
                if (this.state.selectedMailFolders.length === 0) { return; }

                console.log('Now getting messages.');
                this.me.messagesAsync('$select=parentFolderId,bccRecipients,bodyPreview,ccRecipients,id,importance,receivedDateTime,sender,subject,toRecipients&$expand=attachments($select=id,isInline)')
                    .then((messages) => {
                        console.log('Got messages.  Now rendering.');
                        if (this.mounted && this.state.show === ShowState.Welcome) { this.setState({ show: ShowState.Mail }); }
                        this.ProcessMessages([], {}, messages);
                        this.setState({ fetchingMail: false });
                    }).fail((error) => {
                        this.setState({ fetchingMail: false });
                    });
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
        this.me.messageAsync(messageId)
        .then(message => this.setState({ selectedMessage: message.data }))
        .then(() =>
            // Finally, load up the inline images
            messages[0].attachments
                .filter(a => a.isInline)
                .forEach(attachment =>
                    this.me.messageAttachmentAsync(messageId, attachment.id)
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
        .fail(error => console.log('Could not load the message.', error))
    }

    public SelectEvent = (eventId: string) => {
        console.log("Selecting Event", eventId);
        var events = this.state.events.filter(e => e.id === eventId);
        if (events.length == 0)
            return;

        // First render the basic metadata (including body preview)
        this.setState({ selectedEvent: events[0] });

        // Next, get the rest of the message metadata and full body text
        this.me.eventAsync(eventId)
        .then(event => this.setState({ selectedEvent: event.data }))
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

    private ProcessMessages(newList: Kurve.MessageDataModel[], idMap: Object, result: Kurve.Messages) {
        result.data.forEach(message => {
            if (this.state.selectedMailFolders.some((mailFolder) => message.data.parentFolderId === mailFolder.id)) {
                var index = idMap[message.data.id];
                if (index) {
                    newList[index] = message.data; // do an update.
                } else {
                    idMap[message.data.id] = newList.push(message.data); // add it to the list and record index.
                }
            }
        });

        this.setState({ messages: newList, messageIdToIndex: idMap });
        if (newList.length < 40 && result.nextLink) {
            result.nextLink().then(moreMessages => {
                this.ProcessMessages(newList, idMap, moreMessages);
            });
        }
    }

    public GetMailFolders() : Kurve.Promise<void, Kurve.Error> {
        if (this.state.selectedMailFolders.length > 0) {
            var d = new Kurve.Deferred<void, Kurve.Error>();
            d.resolve();
            return d.promise;
        }

        if (!this.me) {
            this.GetMe();
            return;
        }

        console.log('Now getting mail folders.');

        this.setState({ fetchingMailFolders: true });

        return this.me.mailFoldersAsync()
            .then((mailFolders) => {
                return this.ProcessMailFolders([], {}, mailFolders);
            }).fail((error) => {
                this.setState({ fetchingMailFolders: false });
                throw error;
            });
    }

    private ProcessMailFolders(mailFolders: Kurve.MailFolderDataModel[], idMap: Object, result: Kurve.MailFolders): Kurve.Promise<any, Kurve.Error> {
        var d = new Kurve.Deferred<void, Kurve.Error>();

        result.data.map(mailFolder => {
            var index = idMap[mailFolder.data.id];
            if (index) {
                mailFolders[index] = mailFolder.data; // do an update.
            } else {
                idMap[mailFolder.data.id] = mailFolders.push(mailFolder.data); // add it to the list and record index.
            }
        });

        var filteredFolders = mailFolders.filter((mailFolder) => {
            return !excludedMailFolders.some((excludedFolder) => excludedFolder == mailFolder.displayName);
        });

        this.setState({ selectedMailFolders: this.state.selectedMailFolders.concat(filteredFolders) });
        if (mailFolders.length < 40 && result.nextLink) {
            result.nextLink().then(moreFolders => {
                this.ProcessMailFolders(mailFolders, idMap, moreFolders);
                d.resolve();
            })
            .fail(d.reject);
        } else {
            this.setState({ fetchingMailFolders: false });
            d.resolve();
        }

        return d.promise;
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
