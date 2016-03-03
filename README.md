# Office Dashboard for the Tesla

A simple web application that shows your email and other information from Office 365, optimized for the Tesla dashboard computer.

## Try It	

You can try the app here http://aka.ms/offdash.

## RELEASE NOTES - Release 0.1 – First Alpha
 
This app provides a Tesla-friendly way to access your Office information.
 
This is a pure client app that talks directly to Microsoft’s servers over HTTPS with READ-ONLY access so there is very little risk that your information will be compromised.
 
There are several significant limitations and errors with this release:
·       Embedded pictures (in either email or calendar) are not supported
·       The email view shows all messages from every folder in your mailbox – including sent mail
·       Attachments sometimes show up as separate messages
·       Calendar meeting times are shown in military time
 
Please use this link to report bugs or provide suggestions: https://github.com/johnshew/office-dashboard/issues

## Information for developers

Sources at https://github.com/johnshew/office-dashboard/

This app was developed to: 
* Demonstrate how to display information from http://graph.microsoft.io
* Test http://github.com/MicrosoftDx/KurveJS
* Learn more about React and how to use React with Typescript 
* Make it easy to catch up on mail and other Office information using the browser in Tesla http://tesla.com. 

THe app is a simple client-only web application that uses the React framework to display information from Office by connecting to graph.microsoft.com.  

### Implementation notes

The code to connect to the information in Office is in app.tsx. 
It uses the KurveJS library to do most of the heavy lifting to connect to graph.microsoft.com. 
Once the Office information is acquired and placed into app state it gets rendered by set of React components.
    
The user interface is designed to work with both modern browsers and more limited browsers as found on TVs and the Tesla.  
For these more limited browsers the application provides a layout option (in Settings) that is flat without any scrolling regions other than the page itself. 

The user interface is rendered by a set of React components that understand the graph.microsoft.com data models.
Other than using Kurve for these data model definitions, 
the user interface is fully independent of how the Office information is acquired.  
The Office React components may potentially be useful to build other applications.  
If there is interest in this we will factor them out into a seperate Office React library that this application will use.

In terms of UX technologies, the current implementation leverages Bootstrap 3 for the navbar, dialogs, and grid system. 
In the future we may move to React based navbars and dialogs which in turn would mean we can remove the dependency on the Bootstrap javascript library and the associated jquery library.   

Consistent with the recommended approach to React, 
the React components do not use any global CSS classes other than the grid system.  
As noted above, we use the Bootstrap grid system to provide responsive layout. 

### Building the application

After forking the repo
    npm install
    npm run typings
    npm run build (or npm run watch)
    npm run start (to run locally - remember to use http://localhost not http://127.0.0.1)
    
### Tesla browser

The Tesla browser is actually a reasonably modern HTML5 browser implementation based on webkit. With the use of the es5-shim it is able to support modern frameworks such React albiet slowly.

That said it is a pretty challenging environment to debug in.  
Consequently, in the settings you can enable a simple debug console window that displays information written to console.log and provides an immediate command window.  
Also note that we modified VorlonJS to be able to work well with the Tesla.
