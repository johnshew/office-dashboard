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
    events: Kurve.EventDataModel[];
    scroll: boolean;
}

interface CalendarState {
    selected?: string;
}

export default class Calendar extends React.Component<CalendarProps, CalendarState> {
    constructor(props, state) {
        super(props, state);
        this.state = { selected: null };
    }

    private handleSelection = (id: string) => {
        this.setState({ selected: id });
    }

    private selectedCalendarEvent(): Kurve.EventDataModel {
        var found = this.props.events.filter(event => (event.id === this.state.selected));
        return (found.length > 0) ? found[0] : null;
    }

    render() {
        var contentLayoutStyle = (this.props.scroll) ? scrollingContentStyle : {};
        return (
            <div style={ contentLayoutStyle }>
                <div className="col-xs-12 col-sm-4 col-lg-3" style={ listStyle }>
                    <EventList onSelection={ this.handleSelection } selected={ this.state.selected } events={ this.props.events } />
                </div>
                <div className="col-xs-12 col-sm-8 col-lg-9" style={ itemViewStyle }>
                    <EventView event={this.selectedCalendarEvent() } />
                </div>
            </div>
        );
    }
}
