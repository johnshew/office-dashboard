import * as React from 'react';
import * as Utilities from '../lib/utilities';

import Combine = Utilities.Combine;
import EventSummary from './EventSummary';

const summaryStyle: React.CSSProperties = {
    padding: 0,
    paddingTop: 10,
    paddingBottom: 10,
    paddingRight: 15,
    paddingLeft: 15
};

const informationStyle = Combine(summaryStyle, {
    backgroundColor: "LightGrey"
});

interface EventListProps extends React.Props<EventList> {
    events: Kurve.EventDataModel[];
    selected?: string;
    onSelection?(id: string);
}

export default class EventList extends React.Component<EventListProps, any> {
    constructor(props, state) {
        super(props, state);
    }
    private handleSelect = (id: string) => {
        this.props.onSelection(id);
    };
    render() {
        var lastDate = "";
        var eventSummaries = this.props.events.map(event => {
            var date = new Date(event.start.dateTime).toDateString();
            var dateSeparator = (date != lastDate) ? <div style= { informationStyle }>{ date }</div> : null;
            lastDate = date;
            return (
                <div key={ event.id }>
                    { dateSeparator }
                    <EventSummary onSelect={ this.handleSelect } selected={ this.props.selected === event.id } event={ event } />
                </div>
            );
        });
        return <div>{ eventSummaries }</div>;
    }
}
