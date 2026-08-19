#!/bin/bash

echo "🚀 ZNK237 Release Script"
echo ""

# Vérifier la branche
BRANCH=$(git branch --show-current)
if [ "$BRANCH" != "main" ]; then
  echo "❌ Vous devez être sur la branche main"
  exit 1
fi

# Vérifier les changements non commités
if [[ -n $(git status -s) ]]; then
  echo "❌ Vous avez des changements non commités"
  exit 1
fi

# Demander la version
read -p "Version (ex: 1.0.0): " VERSION

if [ -z "$VERSION" ]; then
  echo "❌ Version requise"
  exit 1
fi

# Mettre à jour package.json
echo "📝 Mise à jour de la version..."
npm version $VERSION --no-git-tag-version

# Tests
echo "🧪 Lancement des tests..."
npm test
if [ $? -ne 0 ]; then
  echo "❌ Tests échoués"
  exit 1
fi

# Build pour toutes les plateformes
echo "📦 Build des applications..."
npm run build:all

# Commit et tag
echo "💾 Commit et tag..."
git add .
git commit -m "Release v$VERSION"
git tag -a "v$VERSION" -m "Version $VERSION"

# Push
echo "⬆️  Push vers GitHub..."
git push origin main
git push origin "v$VERSION"

echo ""
echo "✅ Release v$VERSION terminée!"
echo "📦 Fichiers dans dist/"
ls -lh dist/