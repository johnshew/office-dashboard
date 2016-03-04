# Office Dashboard for the Tesla

A simple web application that shows your email and other information from Office 365, optimized for the Tesla dashboard computer.

## Try It	

You can try the app here http://aka.ms/offdash.

## RELEASE NOTES

### Release 0.1 – Public Alpha
 
This app provides a Tesla-friendly way to access your Office information.
 
This is a pure client app that talks directly to Microsoft’s servers over HTTPS with READ-ONLY access so there is very little risk that your information will be compromised.
 
There are several significant limitations and issues in this release:

* Embedded pictures (in either email or calendar) are not supported
* The email view shows all messages from every folder in your mailbox – including sent mail
* Attachments sometimes show up as separate messages
* Calendar meeting times are shown in military time
* You have to login every time you go back to the app - we should persist the tokens
* Loading the messages takes a little while on Tesla and there is no message indicating it is loading
* The settings options are too small to be easily used is the Tesla

Please use this link to report bugs or provide suggestions: https://github.com/johnshew/office-dashboard/issues

## INFORMATION FOR DEVELOPERS

This app was developed to: 
* Demonstrate how to display information from http://graph.microsoft.io
* Test http://github.com/MicrosoftDx/KurveJS
* Learn more about React and how to use React with Typescript 
* Make it easy to catch up on mail and other Office information using the browser in Tesla http://tesla.com. 

The source is available at https://github.com/johnshew/office-dashboard/

### Implementation Notes

The code to connect to the information in Office is in app.tsx. It uses the KurveJS library to do most of the heavy lifting to connect to graph.microsoft.com. 
Once the Office information is acquired and placed into app state it gets rendered by set of React components.
    
The user interface is designed to work with both modern browsers and more limited browsers as found on TVs and the Tesla. For these more limited browsers the application provides a layout option (in Settings) that is flat without any scrolling regions other than the page itself. 

The user interface is rendered by a set of React components that understand the graph.microsoft.com data models. Other than using Kurve for these data model definitions, the user interface is fully independent of how the Office information is acquired.  

The Office React components may potentially be useful to build other applications. If there is interest in this we will factor them out into a seperate Office React library that this application will use.

In terms of UX technologies, the current implementation leverages Bootstrap 3 for the navbar, dialogs, and grid system. In the future we may move to React based navbars and dialogs which in turn would mean we can remove the dependency on the Bootstrap javascript library and the associated jquery library.   

Consistent with the recommended approach to React, the React components do not use any global CSS classes other than the grid system. As noted above, we use the Bootstrap grid system to provide responsive layout. 

### Building the application

After you fork the repo do the following:

    npm install
    npm run typings
    npm run build (or npm run watch)
    npm run start (to run locally - remember to use http://localhost not http://127.0.0.1)
 
### Working with the Tesla browser

The Tesla browser is a reasonably modern HTML5 browser implementation based on webkit. With the use of the es5-shim it is able to support modern frameworks such as React - but in general it is pretty slow.  Also, the browser does a much faster at scrolling an entire page rather than scrolling a div - you can see this by enabling scrolling in the setting dialog. 

That said the car is a pretty challenging environment to debug web pages. To help with this, in the settings you can enable a simple debug console window that displays information written to console.log and provides an immediate command window.  If you need more debug capabilties we updated VorlonJS (http://vorlonjs.com) to be able to work well on the Tesla.
