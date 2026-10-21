# Creates $env:SF_PRIVATE_PATH with an owner-only, inheritance-protected ACL applied at creation,
# opened with no sharing, and writes stdin into it. Fails if the path already exists.
#
# Used by create-github-app.mjs on Windows, where a POSIX mode does nothing and a folder's ACL can
# be widened behind our back (the Codex Windows sandbox service adds a read grant for its sandbox
# users to new folders in the profile). Setting the ACL at creation leaves no moment in which
# another account can open the file.

$ErrorActionPreference = "Stop"
trap {
    # A terminating error must reach the caller as a failed exit code, never as success.
    [Console]::Error.WriteLine("write-private-file: $($_.Exception.Message)")
    exit 1
}
$path = $env:SF_PRIVATE_PATH
if ([string]::IsNullOrWhiteSpace($path)) { throw "SF_PRIVATE_PATH is not set" }

$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$security = [System.Security.AccessControl.FileSecurity]::new()
$security.SetOwner($me)
$security.SetAccessRuleProtection($true, $false)
$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $me,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow))

$bytes = [System.Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())
$stream = [System.IO.FileSystemAclExtensions]::Create(
    [System.IO.FileInfo]::new($path),
    [System.IO.FileMode]::CreateNew,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.IO.FileShare]::None,
    4096,
    [System.IO.FileOptions]::None,
    $security)
try {
    $stream.Write($bytes, 0, $bytes.Length)
} finally {
    $stream.Dispose()
}

# Prove it: exactly one access rule, for this account, and nothing inherited.
$acl = Get-Acl -LiteralPath $path
$rules = @($acl.Access)
$onlyMe = $rules.Count -eq 1 -and $rules[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]) -eq $me -and -not $rules[0].IsInherited
if (-not $onlyMe -or -not $acl.AreAccessRulesProtected) {
    throw "the new file's ACL is not owner-only"
}
