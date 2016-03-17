import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as Utilities from './Utilities';
//TODO: refactor this import when possible. It seems to be a TS limitation.
//More info: http://stackoverflow.com/questions/16386640/typescript-0-9-module-functions
//           https://typescript.codeplex.com/workitem/1058
import Modal = require('react-modal');

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

const modalstyles = {
    overlay: {
        zIndex: 9999
    },
    content: {
        position: null,
        top: 70,
        left: null,
        right: null,
        bottom: null,
        border: null,
        background: null,
        overflow: null,
        WebkitOverflowScrolling: null,
        borderRadius: null,
        padding: null
    }
}

export class Settings extends React.Component<SettingsProps, any> {
    constructor(props, state) {
        super(props, state);
        this.state = {};
    }

    private handleScrollChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        values.scroll = event.target.checked;
        this.props.onChange(values);
    }

    private handleConsoleChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        values.console = event.target.checked;
        this.props.onChange(values);
    }

    private handleInPlaceChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        values.inplace = event.target.checked;
        this.props.onChange(values);
    }

    private handleTestDataChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        values.testData = event.target.checked;
        this.props.onChange(values);
    }

    private handleRefreshChange = (event) => {
        var values = Utilities.ObjectAssign({}, this.props.values);
        var refresh = (event.target.value) ? parseInt(event.target.value) : null;
        values.refreshIntervalSeconds = (refresh === NaN) ? null : refresh;
        this.props.onChange(values);
    }

    private handleModalCloseRequest = (event) => {
        this.props.onModalCloseRequest(event);
    }

    public render() {
        var values = this.props.values;
        return (
            <Modal
                className="modal-dialog"
                closeTimeoutMS={150}
                isOpen={this.props.modalIsOpen}
                onRequestClose={this.handleModalCloseRequest}
                style={modalstyles}
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
                        <input type="textbox" style={ { width: "80px" } } value={ (values.refreshIntervalSeconds === null) ? "" : values.refreshIntervalSeconds.toString() } onChange={ this.handleRefreshChange }/> Refresh interval in seconds.  0 to disable <br/>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-default" onClick={this.handleModalCloseRequest}>Close</button>
                    </div>
                </div>
            </Modal>
        );
    }
}
