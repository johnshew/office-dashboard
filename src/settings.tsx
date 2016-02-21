import * as React from 'react';
import * as Utilities from './utilities';
import { SelectBox } from './selectbox';

export interface SettingsValues {
    noScroll : boolean;
    inplace : boolean;
    console : boolean;
    refreshIntervalSeconds : number; 
}



interface SettingsProps extends React.Props<Settings> {
    values : SettingsValues;
    onChange: (SettingsValue) => void;
}

interface SettingsState {
}

export class Settings extends React.Component<SettingsProps, any> {
    constructor(props, state) {
        super(props, state);
        this.state = { }
    }
    
    private handleNoScrollChange = (event) => {        
        var values = Object.create(this.props.values);
        values.noScroll =  event.target.checked;
        this.props.onChange(values);
    }
     private handleConsoleChange = (event) => {        
        var values = Object.create(this.props.values);
        values.console =  event.target.checked;
        this.props.onChange(values);
    }
        private handleInPlaceChange = (event) => {        
        var values = Object.create(this.props.values);
        values.inplace =  event.target.checked;
        this.props.onChange(values);
    }
        private handleRefreshChange = (event) => {        
        var refresh =  (event.target.value) ? parseInt( event.target.value ) : null;
        refresh = (refresh === NaN) ? null : refresh;
        var values = Utilities.ObjectAssign({},this.props.values,{ refreshIntervalSeconds: refresh });
        this.props.onChange(values);
    }
    public render() {
        var values = this.props.values;
        return (
            <div id="Settings" className="modal fade">

                <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <button type="button" className="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                                <h4 className="modal-title">Settings</h4>
                            </div>
                            <div className="modal-body">
                                <input type="checkbox" checked={ values.noScroll } onChange={ this.handleNoScrollChange }/> Disable Scrolling <br/>
                                <input type="checkbox" checked={ values.inplace } onChange={ this.handleInPlaceChange }/> Login without a new window <br/>
                                <input type="checkbox" checked={ values.console } onChange={ this.handleConsoleChange }/> Show local debug console <br/>
                                <input type="textbox" value={ ( values.refreshIntervalSeconds === null) ? "" : values.refreshIntervalSeconds.toString() } onChange={ this.handleRefreshChange }/> Refresh interval (seconds) <br/>
                                
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-default" data-dismiss="modal">Close</button>
                            </div>
                        </div>
                 </div>
            </div>
        );
    }
}
