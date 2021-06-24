# DSBs GitHub actions
Collection of DSB custom GitHub actions.

## clean-directory

**USE WITH CAUTION!**

This action removes all files and sub-directories, including hidden ones, within a directory. The action will list out the directory contents before and after the delete operation.

## **Inputs**
### **`directory`**

**Optional** The directory to remove contents of.

**NOTE:** If no directory is specified, the `${{ github.workspace }}` directroy will be used.

## **Example: Clean the workspace directory**
Removes all files and folders within the GitHub workspace directory.
```yaml
- uses: dsb-norge/github-actions/clean-directory@v1
```

## **Example: Clean a specific directory**
Removes all files and folders within `my-cache-dir` (under the current working directory).
```yaml
- uses: dsb-norge/github-actions/clean-directory@v1
  with:
    directory: ./my-cache-dir
```
