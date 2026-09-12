import * as React from 'react';
import * as Utilities from './Utilities';

export interface SettingsValues {
    scroll: boolean;
    testData: boolean;
    refreshIntervalSeconds: number;
}

interface SettingsProps {
    values: SettingsValues;
    onChange: (SettingsValue) => void;
}

export class Settings extends React.Component<SettingsProps, any> {
    constructor(props, state) {
        super(props, state);
        this.state = {}
    }

    private handleScrollChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        values.scroll = event.target.checked;
        this.props.onChange(values);
    }

    private handleTestDataChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        values.testData = event.target.checked;
        this.props.onChange(values);
    }

    private handleRefreshChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        var refresh = Number(event.target.value);
        values.refreshIntervalSeconds = Number.isFinite(refresh) && refresh >= 0 ? refresh : 0;
        this.props.onChange(values);
    }

    public render() {
        var values = this.props.values;
        return (
            <div id="Settings" className="modal fade">
                <div className="modal-dialog">
                    <div className="modal-content">
                        <div className="modal-header">
                            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" />
                            <h4 className="modal-title">Settings</h4>
                        </div>
                        <div className="modal-body">
                            <input type="checkbox" checked={ values.scroll } onChange={ this.handleScrollChange }/> Enable Scrolling <br/>
                            {/*<input type="checkbox" checked={ values.testData } onChange={ this.handleTestDataChange }/> Use Test Data <br/>*/}
                            <br/>
                            <input type="number" min="0" style={ { width: "80px" } } value={ values.refreshIntervalSeconds } onChange={ this.handleRefreshChange }/> Refresh interval in seconds.  0 to disable <br/>
                        </div>
                        <div className="modal-footer">
                            <button type="button" className="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
