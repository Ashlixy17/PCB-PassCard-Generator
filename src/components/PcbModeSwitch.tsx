import {PcbProcessingMode} from '../types/pcb';

export function PcbModeSwitch({mode, onChange}: {mode: PcbProcessingMode; onChange: (mode: PcbProcessingMode) => void}) {
  return <div className="pcb-mode-switch" role="group" aria-label="分层工艺" data-mode={mode}>
    <span className="pcb-mode-thumb" aria-hidden="true"/>
    {([{id: 'gray', label: '纯灰度三分分层'}, {id: 'color', label: '彩色识别分层'}] as const).map(item =>
      <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>;
}
