import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Utilities from './Utilities';
//TODO: refactor this import when possible. It seems to be a TS limitation.
//More info: http://stackoverflow.com/questions/16386640/typescript-0-9-module-functions
//           https://typescript.codeplex.com/workitem/1058
import Modal = require('react-modal');
import Styles from './Styles';

export interface SettingsValues {
    scroll: boolean;
    inplace: boolean;
    console: boolean;
    testData: boolean;
    refreshIntervalSeconds: number;
}

interface SettingsProps extends React.Props<Settings> {
    values: SettingsValues;
    onChange: (SettingsValue) => void;
    modalIsOpen: boolean;
    onModalCloseRequest: (event: any) => void;
}

export class Settings extends React.Component<SettingsProps, any> {
    constructor(props, state) {
        super(props, state);
        this.state = {
            settings: Utilities.ObjectAssign({}, this.props.values)
        }
    }

    private handleScrollChange = (event) => {
        this.state.settings.scroll = event.target.checked;
        this.forceUpdate();
    }

    private handleConsoleChange = (event) => {
        this.state.settings.console = event.target.checked;
        this.forceUpdate();
    }

    private handleInPlaceChange = (event) => {
        this.state.settings.inplace = event.target.checked;
        this.forceUpdate();
    }

    private handleTestDataChange = (event) => {
        this.state.settings.testData = event.target.checked;
        this.forceUpdate();
    }

    private handleRefreshChange = (event) => {
        var refresh = (event.target.value) ? parseInt(event.target.value) : null;
        this.state.settings.refreshIntervalSeconds = refresh === NaN ? null : refresh;
        this.forceUpdate();
    }

    private handleModalCloseRequest = (event) => {
        this.applySettings();
        this.props.onModalCloseRequest(event);
    }

    private applySettings = () => {
        this.props.onChange(Utilities.ObjectAssign({}, this.state.settings) );
    }

    private handleDimissButtonClick = () => {
        this.setState({ settings: Utilities.ObjectAssign({}, this.props.values) });
    }

    private settingsChanged = () => {
        for (var key in this.state.settings) {
            if (this.props.values[key] != this.state.settings[key]) {
                return true;
            }
        }
        return false;
    }

    public render() {
        var values = this.state.settings;
        return (
            <Modal
                className="modal-dialog"
                closeTimeoutMS={150}
                isOpen={this.props.modalIsOpen}
                onRequestClose={this.handleModalCloseRequest}
                style={Styles.modal}
            >
                <div className="modal-content">
                    <div className="modal-header">
                        <button type="button" className="close" onClick={this.handleModalCloseRequest}>
                            <span aria-hidden="true">&times;</span>
                            <span className="sr-only">Close</span>
                        </button>
                        <h4 className="modal-title">Settings</h4>
                    </div>
                    <div className="modal-body">
                        <input type="checkbox" checked={ values.scroll } onChange={ this.handleScrollChange }/> Enable Scrolling <br/>
                        <input type="checkbox" checked={ values.inplace } onChange={ this.handleInPlaceChange }/> Login without a new window <br/>
                        <input type="checkbox" checked={ values.console } onChange={ this.handleConsoleChange }/> Show local debug console <br/>
                        {/*<input type="checkbox" checked={ values.testData } onChange={ this.handleTestDataChange }/> Use Test Data <br/>*/}
                        <br/>
                        <input type="textbox" style={ { width: "80px" } } value={ (values.refreshIntervalSeconds == null) ? "" : values.refreshIntervalSeconds.toString() } onChange={ this.handleRefreshChange }/> Refresh interval in seconds.  0 to disable <br/>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-primary" onClick={this.handleModalCloseRequest} disabled={!this.settingsChanged()}>Save</button>
                        <button type="button" className="btn btn-default" onClick={this.handleDimissButtonClick}>Cancel</button>
                    </div>
                </div>
            </Modal>
        );
    }
}
