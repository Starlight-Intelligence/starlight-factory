# Creates $env:SF_PRIVATE_PATH with an owner-only, inheritance-protected ACL applied at creation,
# opened with no sharing, checks the ACL on the open handle, and only then writes stdin into it.
# Fails if the path already exists.
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
# A plain drive or UNC path only: an NTFS alternate stream (file.txt:stream) inherits the security
# of an existing file, so the descriptor below would not apply to it.
if ($path -notmatch '^[A-Za-z]:\\[^:]*$' -and $path -notmatch '^\\\\[^\\?.][^:]*$') {
    throw "not a plain file path"
}

$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$full = [System.Security.AccessControl.FileSystemRights]::FullControl
$security = [System.Security.AccessControl.FileSecurity]::new()
$security.SetOwner($me)
$security.SetAccessRuleProtection($true, $false)
$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $me, $full, [System.Security.AccessControl.AccessControlType]::Allow))

# Read stdin before creating the file, so a failed read leaves nothing behind.
$bytes = [System.Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd())

$stream = [System.IO.FileSystemAclExtensions]::Create(
    [System.IO.FileInfo]::new($path),
    [System.IO.FileMode]::CreateNew,
    $full,
    [System.IO.FileShare]::None,
    4096,
    [System.IO.FileOptions]::None,
    $security)
$written = $false
try {
    # Prove it on the open handle, before any secret byte is written: owned by this account,
    # protected from inheritance, exactly one rule, an Allow FullControl rule for this account.
    $acl = [System.IO.FileSystemAclExtensions]::GetAccessControl($stream)
    $owner = $acl.GetOwner([System.Security.Principal.SecurityIdentifier])
    $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    $private = $owner -eq $me -and $acl.AreAccessRulesProtected -and $rules.Count -eq 1 -and
        $rules[0].IdentityReference -eq $me -and -not $rules[0].IsInherited -and
        $rules[0].AccessControlType -eq [System.Security.AccessControl.AccessControlType]::Allow -and
        $rules[0].FileSystemRights -eq $full
    if (-not $private) { throw "the new file's ACL is not owner-only" }
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
    $written = $true
} finally {
    $stream.Dispose()
    if (-not $written) { Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue }
}
