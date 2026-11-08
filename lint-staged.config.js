export default {
   '*.{js,mjs,cjs,ts,mts,cts}': ['eslint --fix', 'prettier --write'],
   '!(*.{js,mjs,cjs,ts,mts,cts})': 'prettier --write --ignore-unknown',
}
