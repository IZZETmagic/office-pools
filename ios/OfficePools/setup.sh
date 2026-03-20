#!/bin/bash
# Setup script for the Office Pools iOS project.
# Run this once to generate the Xcode project.
#
# Prerequisites:
#   brew install xcodegen
#
# Usage:
#   cd ios/OfficePools
#   chmod +x setup.sh
#   ./setup.sh

set -e

echo "Checking for XcodeGen..."
if ! command -v xcodegen &> /dev/null; then
    echo "XcodeGen not found. Installing via Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "Homebrew not found. Install it first:"
        echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
    brew install xcodegen
fi

echo "Generating Xcode project..."
xcodegen generate

echo ""
echo "Done! Open OfficePools.xcodeproj in Xcode."
echo ""
echo "Before running:"
echo "  1. Open Services/Config.swift"
echo "  2. Set your SUPABASE_URL and SUPABASE_ANON_KEY"
echo "  3. Set your Development Team in project settings (Signing & Capabilities)"
echo "  4. Add a 1024x1024 app icon to Resources/Assets.xcassets/AppIcon.appiconset/"
echo ""
echo "Then press Cmd+R to build and run on the simulator."
