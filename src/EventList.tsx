import * as React from 'react';
import * as Kurve from 'Kurve';
import * as Utilities from './Utilities';

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
    selectedEvent?: Kurve.EventDataModel;
    onSelect(eventId: string);
}

export default class EventList extends React.Component<EventListProps, any> {
    render() {
        var lastDate = "";
        var eventSummaries = this.props.events.map(event => {
            var date = new Date(event.start.dateTime).toDateString();
            var dateSeparator = (date != lastDate) ? <div style= { informationStyle }>{ date }</div> : null;
            lastDate = date;
            return (
                <div key={ event.id }>
                    { dateSeparator }
                    <EventSummary onSelect={ this.props.onSelect } selected={  this.props.selectedEvent && this.props.selectedEvent.id == event.id } event={ event } />
                </div>
            );
        });
        return <div>{ eventSummaries }</div>;
    }
}
