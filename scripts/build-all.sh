#!/bin/bash

# Define the list of targets you want to build
TARGETS=("platform" "mail-bridge" "storage" "worker" "web" "ee-command" "ee-billing")

GITHUB_REPOSITORY="blankparticle/inbox"

# Define the common Docker tag for all images
DOCKER_REGISTRY="ghcr.io/$GITHUB_REPOSITORY"

# Loop over each target and build the Docker image
for TARGET in "${TARGETS[@]}"; do
  echo "Building $TARGET image..."

  docker buildx build \
    --target $TARGET \
    --cache-to=type=local,dest=/tmp/.buildx-cache-new,mode=max \
    --cache-from=type=local,src=/tmp/.buildx-cache \
    -t $DOCKER_REGISTRY/$TARGET:latest \
    --push \
    --file ./Dockerfile \
    .

  if [ $? -eq 0 ]; then
    echo "$TARGET image built successfully!"
  else
    echo "Failed to build $TARGET image"
    exit 1
  fi

done
