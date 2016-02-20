import * as React from 'react';
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
    
    private handleScrollChange = (event) => {        
        var values = Object.create(this.props.values);
        values.noScroll =  event.target.checked;
        this.props.onChange(values);
    }
 
    public render() {
        return (
            <div id="Settings" className="modal fade">

                <div className="modal-dialog">
                        <div className="modal-content">
                            <div className="modal-header">
                                <button type="button" className="close" data-dismiss="modal" aria-hidden="true">&times;</button>
                                <h4 className="modal-title">Settings</h4>
                            </div>
                            <div className="modal-body">
                                <input type="checkbox" checked={ this.props.values.noScroll } onChange={ this.handleScrollChange }/> Disable Scrolling <br/>
                                <input type="checkbox" checked={ this.props.values.inplace } onChange={ this.handleScrollChange }/> Login without a new window <br/>
                                <input type="checkbox" checked={ this.props.values.console } onChange={ this.handleScrollChange }/> Show local debug console <br/>
                                <input type="textbox" value={ this.props.values.refreshIntervalSeconds.toString() } onChange={ this.handleScrollChange }/> Refresh interval (seconds) <br/>
                                
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
