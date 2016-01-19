# GraphDashboard

A web app that shows your email and other information from the Microsoft Graph.  

The goal is to provide a high-performance, low-complexity HTML rendering of key information from the graph including current mail, calendar, and so on.

One of the primary targets is limited browsers such as on TVs and the Tesla.   

## Technologies

The app is good example of using Microsoft graph with React, Typescript, and Kurve.

## Tesla

The Tesla browser is a pretty challenging environment to debug in.  Consequently, many of the test create a mini debug console window to capture console.log and allow an immediate cmd window.

I plan to post more information about getting React running in the Tesla and how to debug.

## Try It	

You can try the app here http://johnshew.github.io/GraphDashboard/public/index.html.

As you can see from the source, this is a pure HTML client app that operates directly against Microsoft servers ensuring no private data can be seen by third parties.
