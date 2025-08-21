const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Serve static files from the 'public' folder
app.use(express.static('public'));

// To parse form data
app.use(express.urlencoded({ extended: true }));

// Home page route
app.get('/', (req, res) => {
  res.render('index');
});

// Route to handle the form submission and secure the Dockerfile
app.post('/secure', (req, res) => {
  try {
    const originalDockerfile = req.body.dockerfileContent;
    
    if (!originalDockerfile || originalDockerfile.trim() === '') {
      return res.render('index', { 
        error: 'Please provide a Dockerfile to scan' 
      });
    }

    // This function contains our security logic
    const securedDockerfile = secureDockerfile(originalDockerfile);

    // Render the result page and pass both Dockerfiles to it
    res.render('result', {
      original: originalDockerfile,
      secured: securedDockerfile
    });
  } catch (error) {
    console.error('Error processing Dockerfile:', error);
    res.render('index', { 
      error: 'An error occurred while processing your Dockerfile' 
    });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`SecureScan app listening on port ${port}`);
});

// Function to secure the Dockerfile
function secureDockerfile(content) {
  let lines = content.split('\n');
  let newLines = [];
  let hasNonRootUser = false;
  let inAptInstall = false;

  for (let line of lines) {
    let newLine = line;

    // Rule 1: Use a specific, slim tag for base images
    if (newLine.startsWith('FROM')) {
      if (newLine.match(/FROM\s+(\S+):latest/)) {
        newLine = newLine.replace(':latest', ':18-slim');
      }
      // Add more rules for other popular base images
      if (newLine.match(/FROM\s+python:latest/)) {
        newLine = newLine.replace(':latest', ':3.9-slim');
      }
      if (newLine.match(/FROM\s+ubuntu:latest/)) {
        newLine = newLine.replace(':latest', ':20.04');
      }
    }

    // Rule 2: Add a non-root user
    if (newLine.startsWith('RUN groupadd') || newLine.startsWith('RUN addgroup') || newLine.startsWith('RUN adduser')) {
      hasNonRootUser = true;
    }

    // Rule 3 & 4: Handle APT packages smartly
    if (newLine.startsWith('RUN apt-get update')) {
      inAptInstall = true;
      newLines.push(newLine);
      continue;
    }

    if (inAptInstall && newLine.startsWith('RUN apt-get install')) {
      newLine = newLine + ' \\\n    && apt-get clean \\\n    && rm -rf /var/lib/apt/lists/*';
      inAptInstall = false;
    }

    newLines.push(newLine);
  }

  // Add the non-root user commands if we didn't find them
  if (!hasNonRootUser) {
    let copyIndex = newLines.findIndex(l => l.startsWith('COPY'));
    if (copyIndex === -1) copyIndex = newLines.length;

    newLines.splice(copyIndex, 0, 'RUN groupadd -r appuser && useradd -r -g appuser appuser');
    newLines.splice(copyIndex + 1, 0, 'USER appuser');
  }

  return newLines.join('\n');
}