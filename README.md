# Regex Definitions
 A naive, regex-based find-in-files implementation of going to the definition of a symbol. The intention is to be used with programming languages (but not limited to them) that lack a language server, intellisense support or where those don't work. This usually happens due to them using a proprietary language or they're just known programming language using scripts that get processed by a custom compiler.

 ## Features

* Go to the definition of a selected text.

## Extension Settings

This extension contributes the following settings:

* `naive-definitions-vscode.generalMatcher`: The expression to be used to match a selected text to a potential definition.
* `naive-definitions-vscode.fileTypes`: A glob for file matching.
* `naive-definitions-vscode.definitions`: Definition keyword/prefix or a regex to which the selected text will be added

## Example

Definitions are various (preferably somewhat unique) keywords/prefixes or regexes to which the selected text will be matched against (via addition, regex etc.). Here is an example code block (containing a supposed custom python-esque language) and definition entries:
### Code
```
def custom_dictionary = dict(key1 = "string_value", key2 = 13)
CREATE_CUSTOM_STRUCT(CUSTOM_STRUCT1, 3, "Entry1", "Entry2", "Entry3")

print("Key1 is {}".format(custom_dictionary.key1)) # outputs "Key1 is "string_value""
print("Field[2] of custom struct is {}".format(CUSTOM_STRUCT1.at(2))) # outputs "Field[2] of custom struct is "Entry2""
```
### Settings
```
"naive-definitions-vscode.definitions": [
  "def",
  "CREATE_CUSTOM_STRUCT",
]
```
For the above code, using the default matcher and the provided definitions, it will go through the workspaces' files and:
* if the selection is *"custom_dictionary"*, it will point to the line containing `def custom_dictionary = dict(key1 = "string_value", key2 = 13)`
* if the selection is the *"CUSTOM_STRUCT1"*, it will point to the line containing `CREATE_CUSTOM_STRUCT(CUSTOM_STRUCT1, 3, "Entry1", "Entry2", "Entry3")`
* if the selection is *"Entry1"*, it will fail since it couldn't find any matching pair of definition & selection 

## Release Notes

### 1.2.6
Made the currently opened file's definitions prioritary

### 1.2.5
Update description and examples

### 1.2.3

Initial release

-----------------------------------------------------------------------------------------------------------

**Enjoy!**
