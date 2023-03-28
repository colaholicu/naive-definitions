# Regex Definitions
 A naive, regex-based find-in-files implementation of going to the definition of a symbol. The intention is to be used with programming languages (but not limited to them) that lack a language server. intellisense support or where those don't work. This usually happens due to them using a proprietary language or they're just known programming language using scripts that get processed by a custom compiler.

 ## Features

* Go to the definition of a selected text.

## Extension Settings

This extension contributes the following settings:

* `naive-definitions-vscode.generalMatcher`: The expression to be used to match a selected text to a potential definition.
* `naive-definitions-vscode.fileTypes`: A glob for file matching.
* `naive-definitions-vscode.definitions`: Definition keyword/prefix or a regex to which the selected text will be added

## Example

Definitions are various (preferably somewhat unique) keywords/prefixes or regexes to which the selected text will be matched against (via addition, regex etc.). Here is an example code block and definition entry:
### Code
```
def custom_dictionary = dict(key1 = "string_value", key2 = 13)

print("Key1 is {}".format(custom_dictionary.key1))
```
### Settings
```
"naive-definitions-vscode.definitions": [
  "def"
]
```
For the above code, using the default matcher and the provided definitions, if the selection is "custom_dictionary", it will try to look for places in the workspace's files where it can find "def custom_dictionary". If successful, it will point to the line containing `def custom_dictionary = dict(key1 = "string_value", key2 = 13)`

## Release Notes

### 1.2.3

Initial release

-----------------------------------------------------------------------------------------------------------

**Enjoy!**
