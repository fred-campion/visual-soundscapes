# Use an official Node runtime as a parent image
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the frontend (Vite) and server (TypeScript)
RUN npm run build:frontend && npm run build:server

# Expose the port the app runs on
ENV PORT=8080
EXPOSE 8080

# Command to run the Express server
CMD ["npm", "run", "start"]
