const fs = require('fs');
const path = require('path');

const deeparGradle = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-deepar',
  'android',
  'build.gradle'
);

if (fs.existsSync(deeparGradle)) {
  let contents = fs.readFileSync(deeparGradle, 'utf8');
  
  const original = contents;
  
  contents = contents.replace(/compileSdkVersion\s+\d+/g, 'compileSdkVersion 35');
  contents = contents.replace(/targetSdkVersion\s+\d+/g, 'targetSdkVersion 34');
  contents = contents.replace(/buildToolsVersion\s+["']\d+\.\d+\.\d+["']/g, '');

  if (contents !== original) {
    fs.writeFileSync(deeparGradle, contents, 'utf8');
    console.log('✅ Patched react-native-deepar build.gradle');
  } else {
    console.log('ℹ️ react-native-deepar already patched or pattern not found');
  }
} else {
  console.warn('⚠️ react-native-deepar build.gradle not found');
}