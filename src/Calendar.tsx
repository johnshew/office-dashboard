import * as React from 'react';

import EventList from './EventList';
import EventView from './EventView';

const scrollingContentStyle: React.CSSProperties = {
    position: "absolute",
    width: "100%",
    top: "51px",
    bottom: "0px"
}

const listStyle: React.CSSProperties = {
    height: "100%",
    borderRight: "thin solid",
    paddingRight: 0,
    paddingLeft: 0,
    overflow: "auto"
}

const itemViewStyle: React.CSSProperties = {
    height: "100%",
    paddingRight: 0,
    paddingLeft: 0,
    overflow: "auto"
}

interface CalendarProps extends React.Props<Calendar> {
    events?: Kurve.EventDataModel[];
    selectedEvent?: Kurve.EventDataModel;
    onSelect(eventId:string);    
    scroll: boolean
}

export default class Calendar extends React.Component<CalendarProps, any> {
    render() {
        var contentLayoutStyle = (this.props.scroll) ? scrollingContentStyle : {};
        return (
            <div style={ contentLayoutStyle }>
                <div className="col-xs-12 col-sm-4 col-lg-3" style={ listStyle }>
                    <EventList onSelect={ this.props.onSelect } events={ this.props.events } selectedEvent={ this.props.selectedEvent } />
                </div>
                <div className="col-xs-12 col-sm-8 col-lg-9" style={ itemViewStyle }>
                    <EventView event={ this.props.selectedEvent } /> 
                </div>
            </div>
        );
    }
}
