# DSBs GitHub actions
Collection of DSB custom GitHub actions.

## directory-recreate

**USE WITH CAUTION!**

This action removes and re-creates a directory including all files and sub-directories within. The directory will be re-created with `rwx` permissions for `user` and no permissions for `group,others`. The action will list out the directory contents before and after the delete operation.

## **Inputs**
### **`directory`**

**Optional** The directory to remove and re-create.

**NOTE:** If no directory is specified, the `${{ github.workspace }}` directroy will be used.

### **`recreate`**

**Optional** If the directory should be re-created or not.

## **Example: Clean the workspace directory**
Removes and re-creates the GitHub workspace directory.
```yaml
- uses: dsb-norge/github-actions/directory-recreate@v1
```

## **Example: Remove a specific directory**
Removes `my-cache-dir` (in the current working directory) and does not re-create it.
```yaml
- uses: dsb-norge/github-actions/directory-recreate@v1
  with:
    directory: ./my-cache-dir
    recreate: false
```
