# Office Dashboard for the Tesla

A simple web application that shows your email and other information from Office 365.

The application is optimized for the Tesla dashboard screen but it works well on desktop and larger mobile devices. 

You can try the app here http://aka.ms/offdash.

IMPORTANT: In Settings make sure “Login without a new window” is checked. If not, expect a warning about popups.

## Release Notes

### Release 0.2 – Public Alpha 2
 
This app provides a Tesla-friendly way to access your Office information.
 
This is a pure client app that talks directly to Microsoft’s servers over HTTPS with READ-ONLY access so there is very little risk that your information will be compromised.
 
New in this release:

* Embedded pictures (in either email or calendar) are now supported
* Calendar events display location
* Once you click "login" you shouldn't have to do so again until you log out

There are still a number of significant limitations and issues in this release:

* The email view shows all messages from every folder in your mailbox – including sent mail
* Attachments sometimes show up as separate messages
* Calendar meeting times are shown in military time
* Loading the messages takes a little while on Tesla and there is no message indicating it is loading
* The settings options are too small to be easily used is the Tesla

Please use this link to report bugs or provide suggestions: https://github.com/johnshew/office-dashboard/issues

## Information for Developers

This app was developed to: 
* Demonstrate how to display information from http://graph.microsoft.io
* Test http://github.com/MicrosoftDx/KurveJS
* Learn more about React and how to use React with Typescript 
* Make it easy to catch up on mail and other Office information using the browser in Tesla http://tesla.com. 

The source is available at https://github.com/johnshew/office-dashboard/

### Implementation Notes

The code to connect to the information in Office can be found in app.tsx. It uses the KurveJS library to do most of the heavy lifting to connect to Azure Active Directory and graph.microsoft.com. 

Once the information is acquired from Office and placed into app state it gets rendered by set of user interface components.
    
The user interface is designed to work with both modern browsers and as well as more limited browsers as found on TVs and the Tesla. For these more limited browsers the application provides a layout option (in Settings) that is flat without any scrolling regions other than the page itself. 

The user interface components are build using React.  These components work with the graph.microsoft.com data models. We use the Kurve library for data model definitions.  However, the user interface components do not depend on Kurve (or any other implementation) to acquire the information that is rendered.

These Office React components may potentially be useful to build other applications. If there is interest in this we will factor them out into a seperate Office React library that this application will use.

In terms of other user interface technologies, the current implementation leverages Bootstrap 3 for the navbar, dialogs, and grid system. In the future we may move to React based navbars and dialogs which in turn would mean we can remove the dependency on the Bootstrap javascript library and the associated jquery library.   

Consistent with the recommended approach to React, the React components do not use any global CSS classes other than the grid system. As noted above, we use the Bootstrap grid system.  Bootstrap is used to provide responsive layout. 

### Building the application

After you fork the repo do the following:

    npm install
    npm run typings
    npm run build (or npm run watch)
    npm run start-http-server (to run locally - remember to use http://localhost not http://127.0.0.1)
 
### Working with the Tesla browser

The Tesla browser is a reasonably modern HTML5 browser implementation based on webkit. With the use of the es5-shim the Browser can support modern frameworks such as React. So in general it is easy to develop a modern web app for the Tesla.  

That said it is important to recognize that the Browser is pretty slow at rendering so don't make your user interface too complicated. In particular note that the Tesla browser is faster at scrolling an entire page relative to scrolling the contents of a div.  You can see this in the app by enabling scrolling in the settings dialog. 

It can be pretty challenging to debug web pages in the Tesla. To help developers working on this app, in the settings you can enable a simple debug console window that displays information written to console.log and it provides an immediate command window.  

If you need more sophisticated debug capabilties note that we updated VorlonJS (http://vorlonjs.com) to work well on the Tesla.
