// app.js
const express = require('express');
const app = express();
const port = process.env.PORT || 3000; // Important for deployment

// Set EJS as the templating engine
app.set('view engine', 'ejs');

// Serve static files (like CSS) from the 'public' folder
app.use(express.static('public'));
// To parse form data
app.use(express.urlencoded({ extended: true }));

// Home page route
app.get('/', (req, res) => {
  res.render('index');
});

// Route to handle the form submission and secure the Dockerfile
app.post('/secure', (req, res) => {
  const originalDockerfile = req.body.dockerfileContent;

  // This function contains our security logic (see section 4)
  const securedDockerfile = secureDockerfile(originalDockerfile);

  // Render the result page and pass both Dockerfiles to it
  res.render('result', {
    original: originalDockerfile,
    secured: securedDockerfile
  });
});

// Start the server
app.listen(port, () => {
  console.log(`SecureScan app listening on port ${port}`);
});

// Function to secure the Dockerfile (will be implemented next)
function secureDockerfile(content) {
  let lines = content.split('\n');
  let newLines = [];

  let hasNonRootUser = false;
  let inAptInstall = false;

  for (let line of lines) {
    let newLine = line;

    // Rule 1: Use a specific, slim tag for base images
    if (newLine.startsWith('FROM')) {
      // A simple regex to find image names
      if (newLine.match(/FROM\s+(\S+):latest/)) {
        newLine = newLine.replace(':latest', ':18-slim'); // Example for Node
      }
      // Add more rules for other popular base images (python, alpine, etc.)
    }

    // Rule 2: Add a non-root user
    if (newLine.startsWith('RUN groupadd') || newLine.startsWith('RUN addgroup') || newLine.startsWith('RUN adduser')) {
      hasNonRootUser = true;
    }

    // Rule 3 & 4: Handle APT packages smartly
    if (newLine.startsWith('RUN apt-get update')) {
      inAptInstall = true; // Next line is likely apt-get install
      newLines.push(newLine); // Keep the update line
      continue; // Skip adding this line again below
    }

    if (inAptInstall && newLine.startsWith('RUN apt-get install')) {
      newLine = newLine + ' \\\n    && apt-get clean \\\n    && rm -rf /var/lib/apt/lists/*';
      inAptInstall = false;
    }

    newLines.push(newLine);
  }

  // Add the non-root user commands if we didn't find them
  if (!hasNonRootUser) {
    // Find a good place to insert the user, often before the COPY or CMD instructions
    let copyIndex = newLines.findIndex(l => l.startsWith('COPY'));
    if (copyIndex === -1) copyIndex = newLines.length; // If no COPY, add at end

    newLines.splice(copyIndex, 0, 'RUN groupadd -r appuser && useradd -r -g appuser appuser');
    newLines.splice(copyIndex + 1, 0, 'USER appuser');
  }

  return newLines.join('\n');
}