!macro customUnInstall
  IfFileExists "$PROGRAMDATA\MyKing\EmployeeConnector\*.*" 0 myKingConnectorCleanupDone
  IfFileExists "$INSTDIR\resources\employee-connector\myking-employee-connector-windows.ps1" 0 myKingConnectorCleanupMissing

  ${IfNot} ${UAC_IsAdmin}
    ShowWindow $HWNDPARENT ${SW_HIDE}
    !insertmacro UAC_RunElevated
    ${Switch} $0
      ${Case} 0
        ${If} $1 = 1
          Quit
        ${EndIf}
        ${Break}
      ${Case} 1223
        ShowWindow $HWNDPARENT ${SW_SHOW}
        MessageBox MB_ICONSTOP "需要系统管理员授权，才能安全移除 My King Employee Connector。"
        Abort
      ${Default}
        ShowWindow $HWNDPARENT ${SW_SHOW}
        MessageBox MB_ICONSTOP "无法获得系统管理员授权，My King Employee Connector 尚未移除。"
        Abort
    ${EndSwitch}
    ShowWindow $HWNDPARENT ${SW_SHOW}
  ${EndIf}

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$INSTDIR\resources\employee-connector\myking-employee-connector-windows.ps1" -Action unbind -PlanPath "$PLUGINSDIR\myking-unbind.json"'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONSTOP "My King Employee Connector 清理失败。请重试卸载。"
    Abort
  ${EndIf}

  Goto myKingConnectorCleanupDone

  myKingConnectorCleanupMissing:
    MessageBox MB_ICONSTOP "My King Employee Connector 清理组件缺失。请重新安装后再卸载。"
    Abort

  myKingConnectorCleanupDone:
!macroend
