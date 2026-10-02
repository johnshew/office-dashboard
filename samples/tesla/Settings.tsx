import * as React from 'react';

export interface SettingsValues {
    scroll: boolean;
    testData: boolean;
    refreshIntervalSeconds: number;
}

interface SettingsProps {
    values: SettingsValues;
    onChange: (values: SettingsValues) => void;
}

interface SettingsState {
    draft: SettingsValues;
}

export class Settings extends React.Component<SettingsProps, SettingsState> {
    private modal = React.createRef<HTMLDivElement>();

    constructor(props: SettingsProps) {
        super(props);
        this.state = { draft: { ...props.values } };
    }

    componentDidMount() {
        this.modal.current.addEventListener('show.bs.modal', this.resetDraft);
    }

    componentWillUnmount() {
        this.modal.current.removeEventListener('show.bs.modal', this.resetDraft);
    }

    private resetDraft = () => {
        this.setState({ draft: { ...this.props.values } });
    }

    private handleScrollChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const scroll = event.target.checked;
        this.setState(previous => ({ draft: { ...previous.draft, scroll } }));
    }

    private handleRefreshChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const refresh = Number(event.target.value);
        const refreshIntervalSeconds = Number.isFinite(refresh) && refresh >= 0 ? refresh : 0;
        this.setState(previous => ({ draft: { ...previous.draft, refreshIntervalSeconds } }));
    }

    private applyDraft = () => {
        this.props.onChange({ ...this.state.draft });
    }

    public render() {
        const values = this.state.draft;
        const changed = values.scroll !== this.props.values.scroll
            || values.testData !== this.props.values.testData
            || values.refreshIntervalSeconds !== this.props.values.refreshIntervalSeconds;
        return (
            <div id="Settings" className="modal fade" ref={this.modal}>
                <div className="modal-dialog">
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" onClick={this.resetDraft} />
                            <h4 className="modal-title">Settings</h4>
                        </div>
                        <div className="modal-body">
                            <label><input type="checkbox" checked={ values.scroll } onChange={ this.handleScrollChange }/> Calendar pane scrolling</label><br/>
                            <br/>
                            <label><input type="number" min="0" style={ { width: "80px" } } value={ values.refreshIntervalSeconds } onChange={ this.handleRefreshChange }/> Refresh interval in seconds. 0 to disable</label><br/>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-primary" data-bs-dismiss="modal" disabled={!changed} onClick={this.applyDraft}>Apply</button>
                            <button type="button" className="btn btn-secondary" data-bs-dismiss="modal" onClick={this.resetDraft}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
