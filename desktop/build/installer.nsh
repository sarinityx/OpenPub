; OpenPub additions to the electron-builder NSIS installer (tools/package.mjs builds it).
;
; File types are registered here, not with electron-builder's "fileAssociations", because those only work for
; per-machine installs. SHELL_CONTEXT is HKCU for a per-user install and HKLM for a per-machine one.
;   .opub  OpenPub's own type: OpenPub becomes its default program, with the document icon.
;   .pub   OpenPub is only added to "Open with" and to Settings > Default apps. The default program for .pub
;          (usually Microsoft Publisher) is left alone.
; Uninstalling keeps the user's settings and personal dictionary unless they say otherwise
; (or, when silent, unless --delete-app-data is passed).

!define OP_EXE "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
!define OP_DOC_ICON "$INSTDIR\resources\opub.ico,0"
!define OP_CLASSES "Software\Classes"
!define OP_CAPS "Software\OpenPub\Capabilities"

!macro opProgId ID DESCRIPTION
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\${ID}" "" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\${ID}" "FriendlyTypeName" "${DESCRIPTION}"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\${ID}\DefaultIcon" "" "${OP_DOC_ICON}"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\${ID}\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\${ID}\shell\open" "FriendlyAppName" "OpenPub"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\${ID}\shell\open\command" "" '"${OP_EXE}" "%1"'
!macroend

!macro customInstall
  !insertmacro opProgId "OpenPub.Project" "OpenPub project"
  !insertmacro opProgId "OpenPub.Publisher" "Publisher file"

  ; .opub belongs to OpenPub
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\.opub" "" "OpenPub.Project"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\.opub" "Content Type" "application/json"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\.opub\OpenWithProgids" "OpenPub.Project" ""

  ; .pub: offered, never taken over
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\.pub\OpenWithProgids" "OpenPub.Publisher" ""

  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "OpenPub"
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".opub" ""
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".pub" ""
  WriteRegStr SHELL_CONTEXT "${OP_CLASSES}\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"${OP_EXE}" "%1"'

  ; Settings > Apps > Default apps
  WriteRegStr SHELL_CONTEXT "${OP_CAPS}" "ApplicationName" "OpenPub"
  WriteRegStr SHELL_CONTEXT "${OP_CAPS}" "ApplicationDescription" "Page-layout editor that opens Microsoft Publisher files"
  WriteRegStr SHELL_CONTEXT "${OP_CAPS}" "ApplicationIcon" '"${OP_EXE}",0'
  WriteRegStr SHELL_CONTEXT "${OP_CAPS}\FileAssociations" ".opub" "OpenPub.Project"
  WriteRegStr SHELL_CONTEXT "${OP_CAPS}\FileAssociations" ".pub" "OpenPub.Publisher"
  WriteRegStr SHELL_CONTEXT "Software\RegisteredApplications" "OpenPub" "${OP_CAPS}"

  ; SHCNE_ASSOCCHANGED: Explorer picks up the new icons and "Open with" entries
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro customUnInstall
  ; .opub: give it up only if it still points at OpenPub
  ReadRegStr $0 SHELL_CONTEXT "${OP_CLASSES}\.opub" ""
  ${if} $0 == "OpenPub.Project"
    DeleteRegValue SHELL_CONTEXT "${OP_CLASSES}\.opub" ""
    DeleteRegValue SHELL_CONTEXT "${OP_CLASSES}\.opub" "Content Type"
  ${endIf}
  DeleteRegValue SHELL_CONTEXT "${OP_CLASSES}\.opub\OpenWithProgids" "OpenPub.Project"
  DeleteRegKey /ifempty SHELL_CONTEXT "${OP_CLASSES}\.opub\OpenWithProgids"
  DeleteRegKey /ifempty SHELL_CONTEXT "${OP_CLASSES}\.opub"
  DeleteRegValue SHELL_CONTEXT "${OP_CLASSES}\.pub\OpenWithProgids" "OpenPub.Publisher"
  DeleteRegKey /ifempty SHELL_CONTEXT "${OP_CLASSES}\.pub\OpenWithProgids"
  DeleteRegKey /ifempty SHELL_CONTEXT "${OP_CLASSES}\.pub"

  DeleteRegKey SHELL_CONTEXT "${OP_CLASSES}\OpenPub.Project"
  DeleteRegKey SHELL_CONTEXT "${OP_CLASSES}\OpenPub.Publisher"
  DeleteRegKey SHELL_CONTEXT "${OP_CLASSES}\Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegValue SHELL_CONTEXT "Software\RegisteredApplications" "OpenPub"
  DeleteRegKey SHELL_CONTEXT "Software\OpenPub"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'

  ; Settings and personal dictionary (Electron keeps them per user, in %APPDATA%\OpenPub).
  ; Not on an update, and when silent only with --delete-app-data (handled by electron-builder).
  ${ifNot} ${isUpdated}
  ${andIfNot} ${Silent}
    ${if} ${Cmd} `MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also remove your OpenPub settings and personal dictionary?$\r$\n$\r$\nChoose No to keep them for the next time you install OpenPub." /SD IDNO IDYES`
      ${if} $installMode == "all"
        SetShellVarContext current
      ${endIf}
      RMDir /r "$APPDATA\${PRODUCT_FILENAME}"
      ${if} $installMode == "all"
        SetShellVarContext all
      ${endIf}
    ${endIf}
  ${endIf}
!macroend
