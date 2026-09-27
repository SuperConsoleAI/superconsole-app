Qwik
This guide will walk you through creating your Tauri app using the Qwik web framework. Learn more about Qwik at <https://qwik.dev>.

Checklist
Use SSG. Tauri doesn’t support server-based solutions.
Use dist/ as frontendDist in tauri.conf.json.
Example Configuration
Create a new Qwik app
npm
yarn
pnpm
deno
npm create qwik@latest
cd <PROJECT>

Install the static adapter
npm
yarn
pnpm
deno
npm run qwik add static

Add the Tauri CLI to your project
npm
yarn
pnpm
deno
npm install -D @tauri-apps/cli@latest

Initiate a new Tauri project
npm
yarn
pnpm
deno
npm run tauri init

Tauri configuration
npm
yarn
pnpm
deno
tauri.conf.json
{
  "build": {
    "devUrl": "<http://localhost:5173>"
    "frontendDist": "../dist",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  }
}

Start your tauri app
npm
yarn
pnpm
deno
npm run tauri dev

Create a Project
One thing that makes Tauri so flexible is its ability to work with virtually any frontend framework. We’ve created the create-tauri-app utility to help you create a new Tauri project using one of the officially maintained framework templates.

create-tauri-app currently includes templates for vanilla (HTML, CSS and JavaScript without a framework), Vue.js, Svelte, React, SolidJS, Angular, Preact, Yew, Leptos, and Sycamore. You can also find or add your own community templates and frameworks in the Awesome Tauri repo.

Alternatively, you can add Tauri to an existing project to quickly turn your existing codebase into a Tauri app.

Using create-tauri-app
To get started using create-tauri-app run one of the below commands in the folder you’d like to setup your project. If you’re not sure which command to use we recommend the Bash command on Linux and macOS and the PowerShell command on Windows.

Bash
PowerShell
Fish
npm
Yarn
pnpm
deno
bun
Cargo
npm create tauri-app@latest

Follow along with the prompts to choose your project name, frontend language, package manager, and frontend framework, and frontend framework options if applicable.

Not sure what to choose?

We recommend starting with the vanilla template (HTML, CSS, and JavaScript without a frontend framework) to get started. You can always integrate a frontend framework later.

Choose which language to use for your frontend: TypeScript / JavaScript
Choose your package manager: pnpm
Choose your UI template: Vanilla
Choose your UI flavor: TypeScript
Scaffold a new project
Choose a name and a bundle identifier (unique-id for your app):

? Project name (tauri-app) ›
? Identifier (com.tauri-app.app) ›

Select a flavor for your frontend. First the language:

? Choose which language to use for your frontend ›
Rust  (cargo)
TypeScript / JavaScript  (pnpm, yarn, npm, bun)
.NET  (dotnet)

Select a package manager (if there are multiple available):

Options for TypeScript / JavaScript:

? Choose your package manager ›
pnpm
yarn
npm
bun

Select a UI Template and flavor (if there are multiple available):

Options for Rust:

? Choose your UI template ›
Vanilla
Yew
Leptos
Sycamore

Options for TypeScript / JavaScript:

? Choose your UI template ›
Vanilla
Vue
Svelte
React
Solid
Angular
Preact

? Choose your UI flavor ›
TypeScript
JavaScript

Options for .NET:

? Choose your UI template ›
Blazor  (<https://dotnet.microsoft.com/en-us/apps/aspnet/web-apps/blazor/>)

Once completed, the utility reports that the template has been created and displays how to run it using the configured package manager. If it detects missing dependencies on your system, it prints a list of packages and prompts how to install them.

Start the development server
After create-tauri-app has completed, you can navigate into your project’s folder, install dependencies, and then use the Tauri CLI to start the development server:

npm
yarn
pnpm
deno
bun
cargo
cd tauri-app
npm install
npm run tauri dev

You’ll now see a new window open with your app running.

Congratulations! You’ve made your Tauri app! 🚀

Manual Setup (Tauri CLI)
If you already have an existing frontend or prefer to set it up yourself, you can use the Tauri CLI to initialize the backend for your project separately.

Note

The following example assumes you are creating a new project. If you’ve already initialized the frontend of your application, you can skip the first step.

Create a new directory for your project and initialize the frontend. You can use plain HTML, CSS, and JavaScript, or any framework you prefer such as Next.js, Nuxt, Svelte, Yew, or Leptos. You just need a way of serving the app in your browser. Just as an example, this is how you would setup a simple Vite app:

npm
yarn
pnpm
deno
bun
mkdir tauri-app
cd tauri-app
npm create vite@latest .

Then, install Tauri’s CLI tool using your package manager of choice. If you are using cargo to install the Tauri CLI, you will have to install it globally.

npm
yarn
pnpm
deno
bun
cargo
npm install -D @tauri-apps/cli@latest

Determine the URL of your frontend development server. This is the URL that Tauri will use to load your content. For example, if you are using Vite, the default URL is <http://localhost:5173>.

In your project directory, initialize Tauri:

npm
yarn
pnpm
deno
bun
cargo
npx tauri init

After running the command it will display a prompt asking you for different options:

✔ What is your app name? tauri-app
✔ What should the window title be? tauri-app
✔ Where are your web assets located? ..
✔ What is the url of your dev server? <http://localhost:5173>
✔ What is your frontend dev command? pnpm run dev
✔ What is your frontend build command? pnpm run build

This will create a src-tauri directory in your project with the necessary Tauri configuration files.

Configure the server.watch.ignored option in vite.config.ts to prevent Vite from watching the src-tauri directory:

vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});

Verify your Tauri app is working by running the development server:

npm
yarn
pnpm
deno
bun
cargo
npx tauri dev

This command will compile the Rust code and open a window with your web content.

Congratulations! You’ve created a new Tauri project using the Tauri CLI! 🚀

Prerequisites
In order to get started building your project with Tauri you’ll first need to install a few dependencies:

System Dependencies
Rust
Configure for Mobile Targets (only required if developing for mobile)
System Dependencies
Follow the link to get started for your respective operating system:

Linux (see below for specific distributions)
macOS Catalina (10.15) and later
Windows 7 and later
Linux
Tauri requires various system dependencies for development on Linux. These may be different depending on your distribution but we’ve included some popular distributions below to help you get setup.

Debian
Arch
Fedora
Gentoo
OSTree
openSUSE
Alpine
NixOS
Terminal window
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev

If your distribution isn’t included above then you may want to check Awesome Tauri on GitHub to see if a guide has been created.

Next: Install Rust

macOS
Tauri uses Xcode and various macOS and iOS development dependencies.

Download and install Xcode from one of the following places:

Mac App Store
Apple Developer website.
Be sure to launch Xcode after installing so that it can finish setting up.

Only developing for desktop targets?
Next: Install Rust

Windows
Tauri uses the Microsoft C++ Build Tools for development as well as Microsoft Edge WebView2. These are both required for development on Windows.

Follow the steps below to install the required dependencies.

Microsoft C++ Build Tools
Download the Microsoft C++ Build Tools installer and open it to begin installation.
During installation check the “Desktop development with C++” option.
Visual Studio C++ Build Tools installer screenshot

Next: Install WebView2.

WebView2
Tip

WebView 2 is already installed on Windows 10 (from version 1803 onward) and later versions of Windows. If you are developing on one of these versions then you can skip this step and go directly to installing Rust.

Tauri uses Microsoft Edge WebView2 to render content on Windows.

Install WebView2 by visiting the WebView2 Runtime download section. Download the “Evergreen Bootstrapper” and install it.

Next: Check VBSCRIPT

VBSCRIPT (for MSI installers)
MSI package building only

This is only required if you plan to build MSI installer packages ("targets": "msi" or "targets": "all" in tauri.conf.json).

Building MSI packages on Windows requires the VBSCRIPT optional feature to be enabled. This feature is enabled by default on most Windows installations, but may have been disabled on some systems.

If you encounter errors like failed to run light.exe when building MSI packages, you may need to enable the VBSCRIPT feature:

Open Settings → Apps → Optional features → More Windows features
Locate VBSCRIPT in the list and ensure it’s checked
Click Next and restart your computer if prompted
Note: VBSCRIPT is currently enabled by default on most Windows installations, but is being deprecated and may be disabled in future Windows versions.

Next: Install Rust

Rust
Tauri is built with Rust and requires it for development. Install Rust using one of following methods. You can view more installation methods at <https://www.rust-lang.org/tools/install>.

Linux and macOS
Windows
Install via rustup using the following command:

Terminal window
curl --proto '=https' --tlsv1.2 <https://sh.rustup.rs> -sSf | sh

Security Tip

We have audited this bash script, and it does what it says it is supposed to do. Nevertheless, before blindly curl-bashing a script, it is always wise to look at it first.

Here is the file as a plain script: rustup.sh

Be sure to restart your Terminal (and in some cases your system) for the changes to take effect.

Next: Configure for Mobile Targets if you’d like to build for Android and iOS, or, if you’d like to use a JavaScript framework, install Node. Otherwise Create a Project.

Node.js
JavaScript ecosystem

Only if you intend to use a JavaScript frontend framework

Go to the Node.js website, download the Long Term Support (LTS) version and install it.
Check if Node was successfully installed by running:
Terminal window
node -v

# v20.10.0

npm -v

# 10.2.3

It’s important to restart your Terminal to ensure it recognizes the new installation. In some cases, you might need to restart your computer.

While npm is the default package manager for Node.js, you can also use others like pnpm or yarn. To enable these, run corepack enable in your Terminal. This step is optional and only needed if you prefer using a package manager other than npm.

Next: Configure for Mobile Targets or Create a project.

Configure for Mobile Targets
If you’d like to target your app for Android or iOS then there are a few additional dependencies that you need to install:

Android
iOS
Android
Download and install Android Studio from the Android Developers website
Set the JAVA_HOME environment variable:
Linux
macOS
Windows
Terminal window
export JAVA_HOME=/opt/android-studio/jbr

Use the SDK Manager in Android Studio to install the following:
Android SDK Platform
Android SDK Platform-Tools
NDK (Side by side)
Android SDK Build-Tools
Android SDK Command-line Tools
Selecting “Show Package Details” in the SDK Manager enables the installation of older package versions. Only install older versions if necessary, as they may introduce compatibility issues or security risks.

Set ANDROID_HOME and NDK_HOME environment variables.
Linux
macOS
Windows
Terminal window
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk)"

Add the Android targets with rustup:
Terminal window
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android

Next: Setup for iOS or Create a project.

iOS
macOS Only

iOS development requires Xcode and is only available on macOS. Be sure that you’ve installed Xcode and not Xcode Command Line Tools in the macOS system dependencies section.

Add the iOS targets with rustup in Terminal:
Terminal window
rustup target add aarch64-apple-ios x86_64-apple-ios aarch64-apple-ios-sim

Install Homebrew:
Terminal window
/bin/bash -c "$(curl -fsSL <https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh>)"

Install Cocoapods using Homebrew:
Terminal window
brew install cocoapods

Next: Create a project.
