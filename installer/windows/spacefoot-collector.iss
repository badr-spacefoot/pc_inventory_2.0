#ifndef AppVersion
#define AppVersion "0.0.0-dev"
#endif

#define RepoRoot AddBackslash(SourcePath) + "..\..\"

[Setup]
AppId={{D8F2992B-38FA-4B9F-9D8D-9B63D71CBBF8}
AppName=Spacefoot IT Collector
AppVersion={#AppVersion}
AppPublisher=Spacefoot IT
AppPublisherURL=https://github.com/badr-spacefoot/pc_inventory_2.0
AppSupportURL=https://github.com/badr-spacefoot/pc_inventory_2.0/issues
DefaultDirName={autopf}\Spacefoot IT Collector
DefaultGroupName=Spacefoot IT Collector
DisableProgramGroupPage=yes
OutputDir={#RepoRoot}dist\installer
OutputBaseFilename=Spacefoot-IT-Collector-{#AppVersion}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=admin
UninstallDisplayIcon={app}\spacefoot-it-collector-windows.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Files]
Source: "{#RepoRoot}dist\spacefoot-it-collector-windows\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#RepoRoot}installer-assets\osquery.msi"; DestDir: "{app}\dependencies"; DestName: "osquery.msi"; Flags: ignoreversion

[Icons]
Name: "{group}\Spacefoot IT Collector"; Filename: "{app}\spacefoot-it-collector-windows.exe"
Name: "{autodesktop}\Spacefoot IT Collector"; Filename: "{app}\spacefoot-it-collector-windows.exe"; Tasks: desktopicon

[Registry]
Root: HKCR; Subkey: "spacefoot-collector"; ValueType: string; ValueData: "URL:Spacefoot IT Collector"; Flags: uninsdeletekey
Root: HKCR; Subkey: "spacefoot-collector"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCR; Subkey: "spacefoot-collector\DefaultIcon"; ValueType: string; ValueData: "{app}\spacefoot-it-collector-windows.exe,0"
Root: HKCR; Subkey: "spacefoot-collector\shell\open\command"; ValueType: string; ValueData: """{app}\spacefoot-it-collector-windows.exe"" ""%1"""

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Run]
Filename: "msiexec.exe"; Parameters: "/i ""{app}\dependencies\osquery.msi"" /quiet /norestart"; StatusMsg: "Installing osquery inventory engine..."; Flags: waituntilterminated runhidden; Check: ShouldInstallOsquery
Filename: "{app}\spacefoot-it-collector-windows.exe"; Description: "{cm:LaunchProgram,Spacefoot IT Collector}"; Flags: nowait postinstall skipifsilent

[Code]
function ShouldInstallOsquery(): Boolean;
begin
  Result :=
    not FileExists(ExpandConstant('{pf}\osquery\osqueryi.exe')) and
    not FileExists(ExpandConstant('{pf32}\osquery\osqueryi.exe')) and
    not RegKeyExists(HKLM, 'SOFTWARE\osquery') and
    not RegKeyExists(HKLM64, 'SOFTWARE\osquery');
end;
