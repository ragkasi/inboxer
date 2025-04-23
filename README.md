# Inbox Group & Mass-Delete Extension

A browser extension that helps you clean up your inbox by grouping emails by sender/company for quick mass-deletion.

## Features

- Group emails by sender/company
- Quick mass-deletion of emails
- Works with Gmail and Outlook
- Simple and intuitive user interface

## Installation

### From Chrome Web Store

1. Navigate to the Chrome Web Store (coming soon)
2. Search for "Inbox Group & Mass-Delete"
3. Click "Add to Chrome"

### Manual Installation (Developer Mode)

1. Download the latest release zip file
2. Unzip the file to a location of your choice
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in the top-right corner)
5. Click "Load unpacked"
6. Select the unzipped folder

## Development Setup

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Installation

1. Clone the repository
   ```
   git clone [repository-url]
   cd email-cleaner-ext
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Create a `.env` file based on the `.env.example` file and fill in the required values
   ```
   cp .env.example .env
   ```

### Development Commands

- Build the extension for development:
  ```
  npm run dev
  ```

- Build the extension for production:
  ```
  npm run build
  ```

- Watch for changes during development:
  ```
  npm run watch
  ```

- Clean the dist directory:
  ```
  npm run clean
  ```

### Loading the Extension in Chrome

1. Build the extension using one of the commands above
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked"
5. Select the `dist` folder from the project directory

## Usage

1. Install the extension
2. Click on the extension icon in your browser toolbar
3. Authenticate with your email provider if prompted
4. Browse through your emails grouped by sender
5. Select emails for deletion
6. Click "Delete Selected" to remove them

## Technologies Used

- React for the user interface
- Redux for state management
- Webpack for bundling
- Chrome Extension API
- Gmail and Microsoft Graph APIs for email integration

## License

[MIT License](LICENSE)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 