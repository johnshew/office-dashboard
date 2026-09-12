import * as React from 'react';
import { createRoot } from 'react-dom/client';
import type { Message, Event, FileAttachment, User } from '@microsoft/microsoft-graph-types';
import QRCode from 'qrcode';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import './dashboard.css';
import * as Utilities from './Utilities';
import Identity, { DeviceCode } from './Identity';
import About from './About';
import { Settings, SettingsValues } from './Settings';
import Mail from '../../src/Mail';
import Calendar from '../../src/Calendar';
import { MessageAttachments, AttachmentDictionary } from '../../src/Utilities';

const loadingMessageStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: 0,
    right: 0,
    padding: 10,
    fontWeight: 'bold'
};

enum ShowState { Welcome, Mail, Calendar, Contacts, Notes };


interface AppProps {
}

interface AppState {
    fetchingMail? : Boolean;
    fetchingCalendar? : Boolean;
    messages?: Message[];
    messageAttachments?: MessageAttachments;
    messageIdToIndex?: Object;
    events?: Event[];
    eventIdToIndex?: Object;
    show?: ShowState;
    settings?: SettingsValues;
    error?: string;
    ready?: boolean;
    busy?: boolean;
    deviceCode?: DeviceCode;
    qrCode?: string;
}

class App extends React.Component<AppProps, AppState> {
    private identity = new Identity();
    private me: User;
    // private eventIdToIndex: {};  now in state
    private mounted = false;
    private storage: Utilities.Storage;
    private generation = 0;
    private deviceTimer: ReturnType<typeof setTimeout>;

    // private loginNewWindow: boolean;
    private timerHandle: any;

    constructor(props: AppProps) {
        super(props);
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
                testData: false,
                refreshIntervalSeconds: 5*60
            }
        };

        Utilities.ObjectAssign(this.state.settings, Utilities.Storage.getItem("settings")); // replace defaults with anything we find in storage.

        this.me = null;

        document.getElementById("DoLogin").onclick = (e) => this.Login();
        document.getElementById("DoLogout").onclick = (e) => this.Logout();
        document.getElementById("ShowMail").onclick = (e) => this.ShowMail();
        document.getElementById("ShowCalendar").onclick = (e) => this.ShowCalendar();
        document.getElementById("ShowContacts").onclick = (e) => this.ShowContacts();
        document.getElementById("ShowNotes").onclick = (e) => this.ShowNotes();
        document.getElementById("RefreshCurrentView").onclick = (e) => this.RefreshCurrentView();

    }

    private renderMail() {
        return <Mail
            messages={this.state.messages}
            messageAttachments={this.state.messageAttachments}
            onMessageAttachmentDownloadRequest={this.DownloadMessageAttachments.bind(this)}
            scroll={this.state.settings.scroll}
            mailboxes={["inbox", "sent items"]}
        />
    }

    public render() {
        var welcome = (this.state.show == ShowState.Welcome) ? <div className="p-4">
            <h2>Welcome</h2>
            <p>Please log in to access your information.</p>
            <button className="btn btn-primary me-2" disabled={!this.state.ready || this.state.busy} onClick={() => this.Login()}>Login with Microsoft</button>
            {this.identity.deviceEnabled
                ? <button className="btn btn-secondary" disabled={!this.state.ready || this.state.busy} onClick={() => this.DeviceLogin()}>Login with iPhone / device QR code</button>
                : <p className="mt-3">Device QR login requires a configured device sign-in service. Microsoft sign-in may also offer an iPhone passkey QR code if your account and browsers support it.</p>}
        </div> : null;
        var mail = (this.state.show == ShowState.Mail) ? this.renderMail() : null;
        var calendar = (this.state.show == ShowState.Calendar) ? <Calendar events={ this.state.events } scroll={ this.state.settings.scroll } /> : null;
        var loadingMessage = (this.state.fetchingMail || this.state.fetchingCalendar) ? <div style={ loadingMessageStyle }>Loading...</div> : null;

        return (
            <div>
                { loadingMessage }
                {this.state.error && <div className="alert alert-danger" role="alert">{this.state.error}</div>}
                { welcome }
                {this.state.deviceCode && <section className="p-4" aria-live="polite">
                    <h2>Continue on your iPhone</h2>
                    {this.state.qrCode && <img src={this.state.qrCode} width="256" height="256" alt="Scan to open Microsoft's device sign-in page" />}
                    <p>Scan with the Camera app, then enter <strong>{this.state.deviceCode.userCode}</strong> on your phone.</p>
                    <p>Or open <a href={this.state.deviceCode.verificationUri} target="_blank" rel="noopener noreferrer">{this.state.deviceCode.verificationUri}</a> on your phone.</p>
                    <p>Approve only the sign-in you started here. This dashboard continues automatically; nothing needs to be typed in this browser.</p>
                    <p>Code expires at {new Date(this.state.deviceCode.expiresAt).toLocaleTimeString()}.</p>
                    <button className="btn btn-secondary" onClick={() => this.CancelDeviceLogin()}>Cancel device login</button>
                </section>}
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
        this.UpdateLoginState();
        this.identity.initialize().then(() => {
            this.setState({ ready: true });
            if (this.IsLoggedIn()) this.LoggedIn();
        }).catch(error => {
            this.setState({ ready: this.identity.ready });
            this.showError(error);
        });
    }

    public componentWillUnmount() {
        console.log("App unmounted")
        this.mounted = false;
        this.generation++;
        clearTimeout(this.deviceTimer);
        this.StopRefreshFromCloud();
        void this.identity.cancelDeviceLogin();
    }

    handleSettingsChange = (updated: SettingsValues) => {
        console.log(JSON.stringify(updated));
        var settings = Utilities.ObjectAssign({}, this.state.settings, updated);
        this.setState({ settings: settings });
        Utilities.Storage.setItem("settings", settings);
        this.RefreshFromCloud(updated.refreshIntervalSeconds * 1000);
    }

    private showError(error: unknown) {
        if (this.mounted) this.setState({ error: error instanceof Error ? error.message : 'Unable to complete the request. Please try again.' });
    }

    public async GetCalendarEvents() {
        if (!this.IsLoggedIn() || this.state.fetchingCalendar) return;
        const generation = this.generation;
        console.log('Now getting calendar events.');
        var now = new Date(Date.now())
        var today = new Date();
        var nextWeek = new Date(today.getFullYear(), today.getMonth(), today.getDate()+7);
        this.setState({ fetchingCalendar: true });

        try {
            const events = await this.identity.collection<Event>("/me/calendarView?$orderby=start/dateTime&startDateTime=" + now.toISOString() + "&endDateTime=" + nextWeek.toISOString());
            if (generation === this.generation) this.setState({ events });
        } catch (error) {
            if (generation === this.generation) this.showError(error);
        } finally {
            if (generation === this.generation) this.setState({ fetchingCalendar: false });
        }
    }

    public async GetMessages() {
        if (!this.IsLoggedIn() || this.state.fetchingMail) return;
        const generation = this.generation;
        console.log('Now getting messages.');
        this.setState({ fetchingMail: true });

        try {
            const messages = await this.identity.collection<Message>('/me/messages?$orderby=receivedDateTime desc&$expand=attachments($select=id,isInline)');
            if (generation === this.generation) this.setState({ messages });
        } catch (error) {
            if (generation === this.generation) this.showError(error);
        } finally {
            if (generation === this.generation) this.setState({ fetchingMail: false });
        }
    }

    public DownloadMessageAttachments(messageId: string) {
        const generation = this.generation;
        if (!this.state.messages)
            return;
        var messages = this.state.messages.filter(m => m.id === messageId);
        if (messages.length == 0)
            return;
        this.setState({messageAttachments: new MessageAttachments(messageId)});
        (messages[0].attachments || [])
            .filter(a => a.isInline)
            .forEach(attachment => {
                this.identity.get<FileAttachment>(`/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachment.id)}`)
                .then(attachment => {
                    if (generation === this.generation && attachment['@odata.type'] === '#microsoft.graph.fileAttachment') {
                        this.setState(state => {
                            if (state.messageAttachments?.messageId !== messageId) return null;
                            const messageAttachments = new MessageAttachments(messageId, state.messageAttachments.attachments);
                            messageAttachments.attachments[attachment.contentId] = attachment;
                            return { messageAttachments };
                        });
                    }
                }).catch(error => {
                    if (generation === this.generation) this.showError(error);
                });
            });
    }

    public UpdateLoginState() {
        if (this.identity.isLoggedIn()) {
            document.getElementById("DoLogin").style.display = "inherit";
            document.getElementById("DoLogout").style.display = "inherit";
            document.getElementById("RefreshCurrentView").style.display = "inherit";
        } else {
            document.getElementById("DoLogin").style.display = "inherit";
            document.getElementById("DoLogout").style.display = "none";
            document.getElementById("RefreshCurrentView").style.display = "none";
        }
    }

    public async LoggedIn() {
        console.log('Successful login.');
        this.UpdateLoginState();
        if (this.mounted) {
            this.setState({ show: ShowState.Mail });
        }
        const generation = this.generation;
        try {
            const me = await this.identity.get<User>('/me');
            if (generation !== this.generation) return;
            this.me = me;
            document.getElementById("UsernameText").textContent = me.displayName || '';
            this.RefreshTick();
        } catch (error) {
            if (generation === this.generation) this.showError(error);
        }
    }

    public IsLoggedIn(): boolean {
        return this.identity.isLoggedIn();
    }

    public async Login() {
        if (!this.state.ready || this.state.busy) return;
        this.setState({ busy: true, error: undefined });
        try { await this.identity.login(); }
        catch (error) { this.showError(error); this.setState({ busy: false }); }
    }

    public async Logout() {
        this.generation++;
        this.StopRefreshFromCloud();
        clearTimeout(this.deviceTimer);
        this.me = null;
        this.setState({ show: ShowState.Welcome, messages: [], events: [], messageAttachments: undefined,
            fetchingMail: false, fetchingCalendar: false, busy: false, deviceCode: undefined, qrCode: undefined, error: undefined });
        document.getElementById("UsernameText").textContent = '';
        try { await this.identity.logout(); } catch (error) { this.showError(error); }
        this.UpdateLoginState();
    };

    public async DeviceLogin() {
        if (!this.state.ready || this.state.busy) return;
        const generation = ++this.generation;
        this.setState({ busy: true, error: undefined });
        try {
            const deviceCode = await this.identity.startDeviceLogin();
            if (generation !== this.generation) return;
            this.setState({ deviceCode });
            const qrCode = await QRCode.toDataURL(deviceCode.verificationUri, { width: 256, margin: 2 });
            if (generation !== this.generation) return;
            this.setState({ qrCode });
            const poll = async () => {
                if (generation !== this.generation) return;
                try {
                    if (Date.now() >= deviceCode.expiresAt) throw new Error('Device code expired. Start a new device login.');
                    const status = await this.identity.checkDeviceLogin();
                    if (generation !== this.generation) return;
                    if (status === 'complete') {
                        this.setState({ deviceCode: undefined, qrCode: undefined, busy: false });
                        this.LoggedIn();
                    } else if (status === 'pending') {
                        this.deviceTimer = setTimeout(poll, deviceCode.interval * 1000);
                    } else {
                        throw new Error('Device login was declined or expired. Please try again.');
                    }
                } catch (error) {
                    if (generation !== this.generation) return;
                    await this.CancelDeviceLogin();
                    this.showError(error);
                }
            };
            this.deviceTimer = setTimeout(poll, deviceCode.interval * 1000);
        } catch (error) {
            if (generation !== this.generation) return;
            await this.CancelDeviceLogin();
            this.showError(error);
        }
    }

    public async CancelDeviceLogin() {
        this.generation++;
        clearTimeout(this.deviceTimer);
        this.setState({ deviceCode: undefined, qrCode: undefined });
        await this.identity.cancelDeviceLogin();
        this.setState({ busy: false });
    }

    private handleMultiChange = (e) => {
        console.log(JSON.stringify(e));
    }

    private ShowMail() {
        if (this.IsLoggedIn()) this.setState({ show: ShowState.Mail });
    }

    private ShowCalendar() {
        if (this.IsLoggedIn()) this.setState({ show: ShowState.Calendar });
    }

    private ShowContacts() {

    }

    private ShowNotes() {

    }

    private RefreshFromCloud(delay: number) {
        console.log("Setting next refresh to " + delay + "ms");
        clearTimeout(this.timerHandle);
        if (!Number.isFinite(delay) || delay <= 0) return;
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
        this.setState({ error: undefined });
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

createRoot(document.getElementById("App")).render(<App />);
