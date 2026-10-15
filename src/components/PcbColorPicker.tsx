import {useId,useRef} from 'react';
import {PCB_MASK_COLORS} from '../types/pcb';

export function PcbColorPicker({color,onChange,context='preview'}:{color:string;onChange:(color:string)=>void;context?:string}) {
  const id=useId(),picker=useRef<HTMLInputElement|null>(null);
  const preset=PCB_MASK_COLORS.find(item=>item.color.toLowerCase()===color.toLowerCase());
  return <div className="pcb-color-control">
    <label htmlFor={id}>阻焊颜色</label>
    <div className="pcb-color-inputs">
      <select id={id} value={preset?.color||'custom'} data-testid={`pcb-mask-${context}`} onChange={event=>{
        if(event.target.value==='custom')picker.current?.click();else onChange(event.target.value);
      }}>
        {PCB_MASK_COLORS.map(item=><option key={item.color} value={item.color}>{item.name}</option>)}
        <option value="custom">自定义</option>
      </select>
      <input ref={picker} type="color" value={color} onChange={event=>onChange(event.target.value)} aria-label="自定义阻焊颜色" data-testid={`pcb-mask-custom-${context}`}/>
      <span className="pcb-color-code">{color.toUpperCase()}</span>
    </div>
  </div>;
}
