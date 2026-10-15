import React, { useState, useEffect, useRef } from 'react';
import {Archive,FolderOpen,Loader2} from 'lucide-react';
import { CharacterRecord, E1Options, PassCardInfo } from './types';
import {PcbSettings,PCB_DEFAULTS,normalizePcbSettings} from './types/pcb';
import { DEFAULT_CHARACTERS } from './data/defaultCharacters';
import { CharacterDatabasePanel } from './components/CharacterDatabasePanel';
import { PassEditorForm } from './components/PassEditorForm';
import { PcbPreview } from './components/PcbPreview';
import { ImageCropperModal } from './components/ImageCropperModal';
import { PcbExportModal } from './components/PcbExportModal';
import {ImportedPcbProject,PcbModelSize} from './types/pcbProject';
import {readPcbArchive} from './utils/pcbProject';

const LOCAL_STORAGE_DB_KEY = 'PASS_CARD_GEN_CHARACTERS_V2';
const PCB_SETTINGS_KEY = 'PASS_CARD_GEN_PCB_SETTINGS_V1';

export default function App() {
  // 1. Characters Database State (Loads all 427 characters from characters.json)
  const [characters, setCharacters] = useState<CharacterRecord[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length >= DEFAULT_CHARACTERS.length) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_CHARACTERS;
  });

  const defaultChar = DEFAULT_CHARACTERS.find((c) => c.english_name === 'Muelsyse') || DEFAULT_CHARACTERS[0];
  const defaultColor = defaultChar.base_color || defaultChar.back_color || '#0d1b2a';

  const [mode, setMode] = useState<'existing' | 'custom'>('existing');
  const [activeCharacter, setActiveCharacter] = useState<CharacterRecord | null>(defaultChar);

  // 2. Pass Card Info State
  const [info, setInfo] = useState<PassCardInfo>({
    chinese_name: defaultChar.chinese_name,
    english_name: defaultChar.english_name,
    english_name2: defaultChar.english_name2 || '',
    id: defaultChar.id,
    profession: defaultChar.profession,
    profession_en: defaultChar.profession_en,
    barcode_text: defaultChar.barcode_text || defaultChar.english_name,
    back_color: defaultColor,
    base_color: defaultColor,
    show_icon: defaultChar.show_icon !== false,
    faction: defaultChar.faction || '罗德岛',
  });

  // 3. Logo Layout State
  const [e1Opts, setE1Opts] = useState<E1Options>({
    enabled: true,
    faction: defaultChar.faction || '罗德岛',
    iconX: 0,
    iconY: 0,
    iconScale: 1.0,
    gradientEnabled: false,
    frontColor: defaultColor,
    gradColor: '#1e3a8a',
  });

  // 4. Photo Upload States
  const [rawFrontPhotoUrl, setRawFrontPhotoUrl] = useState<string>('');
  const [rawCutoutPhotoUrl, setRawCutoutPhotoUrl] = useState<string>('');

  const [frontPhotoUrl, setFrontPhotoUrl] = useState<string>('');
  const [cutoutPhotoUrl, setCutoutPhotoUrl] = useState<string>('');
  const [customIconUrl, setCustomIconUrl] = useState<string>('');

  const [pcbSettings,setPcbSettings]=useState<PcbSettings>(()=>{
    try{return normalizePcbSettings(JSON.parse(localStorage.getItem(PCB_SETTINGS_KEY)||'null'));}
    catch{return {...PCB_DEFAULTS,overrides:{}};}
  });
  const [pcbDetailRequest,setPcbDetailRequest]=useState(0);
  const [modelSize,setModelSize]=useState<PcbModelSize>({width:59,thickness:1.6});
  const [importedBoard,setImportedBoard]=useState<ImportedPcbProject|null>(null);
  const [importing,setImporting]=useState(false);
  const [importMessage,setImportMessage]=useState('');
  const [importError,setImportError]=useState('');
  const [boardRevision,setBoardRevision]=useState(0);
  const boardFileInput=useRef<HTMLInputElement|null>(null);
  const templatePreferences=useRef<{settings:PcbSettings;size:PcbModelSize}|null>(null);
  useEffect(()=>{
    try{localStorage.setItem(PCB_SETTINGS_KEY,JSON.stringify(pcbSettings));}
    catch(error){console.warn('PCB 参数未能保存到本地',error);}
  },[pcbSettings]);

  // 6. Modals
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);
  const [isBatchExportModalOpen, setIsBatchExportModalOpen] = useState<boolean>(false);

  const handleImportPcb=async(file:File)=>{
    setImporting(true);setImportError('');
    try {
      if(file.size>100*1024*1024)throw new Error('ZIP 文件超过 100 MB');
      const project=await readPcbArchive(await file.arrayBuffer(),file.name);
      if(project.kind==='board') {
        if(!importedBoard)templatePreferences.current={settings:pcbSettings,size:modelSize};
        setImportedBoard(project);
      } else {
        templatePreferences.current=null;setImportedBoard(null);
        const restored=project.inputs;
        setInfo(restored.info);setE1Opts(restored.e1Opts);
        setFrontPhotoUrl(restored.frontPhotoUrl);setCutoutPhotoUrl(restored.cutoutPhotoUrl);setCustomIconUrl(restored.customIconUrl);
        setRawFrontPhotoUrl(project.rawFrontPhotoUrl||restored.frontPhotoUrl);setRawCutoutPhotoUrl(project.rawCutoutPhotoUrl||restored.cutoutPhotoUrl);
        const character=characters.find(item=>item.id===restored.info.id&&item.english_name===restored.info.english_name)||null;
        setActiveCharacter(character);setMode(character?'existing':'custom');
      }
      setPcbSettings(project.settings);setModelSize(project.modelSize);
      setIsCropModalOpen(false);setIsBatchExportModalOpen(false);setPcbDetailRequest(0);setBoardRevision(value=>value+1);
      setImportMessage(`${project.name}：${project.notice}`);
    }catch(error){setImportError(error instanceof Error?error.message:'导入板面失败');}
    finally{setImporting(false);}
  };
  const returnToTemplate=()=>{
    if(templatePreferences.current){setPcbSettings(templatePreferences.current.settings);setModelSize(templatePreferences.current.size);}
    templatePreferences.current=null;setImportedBoard(null);setImportMessage('');setImportError('');setPcbDetailRequest(0);setBoardRevision(value=>value+1);
  };
  const previewInputs=importedBoard?.inputs||{info,e1Opts,frontPhotoUrl,cutoutPhotoUrl,customIconUrl};

  // Save character DB to localStorage on changes
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(characters));
  }, [characters]);

  // When picking a character from DB
  const handleSelectCharacter = (char: CharacterRecord) => {
    const mainColor = char.base_color || char.back_color || '#ff96d2';
    setActiveCharacter(char);
    setInfo({
      chinese_name: char.chinese_name,
      english_name: char.english_name,
      english_name2: char.english_name2 || '',
      id: char.id,
      profession: char.profession,
      profession_en: char.profession_en,
      barcode_text: char.barcode_text || char.english_name,
      back_color: mainColor,
      base_color: mainColor,
      show_icon: char.show_icon !== false,
      faction: char.faction || '罗德岛',
    });
    setE1Opts((prev) => ({
      ...prev,
      faction: char.faction || '罗德岛',
      frontColor: mainColor,
    }));
  };

  const handleFrontPhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setRawFrontPhotoUrl(url);
      setFrontPhotoUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleCutoutPhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const url = e.target?.result as string;
      setRawCutoutPhotoUrl(url);
      setCutoutPhotoUrl(url);
    };
    reader.readAsDataURL(file);
  };

  const handleCustomIconUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setCustomIconUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveToDatabase = () => {
    if (!info.english_name || !info.id) {
      alert('请确保填写英文姓名与证件编号！');
      return;
    }

    const newRecord: CharacterRecord = {
      id: info.id,
      chinese_name: info.chinese_name,
      english_name: info.english_name,
      english_name2: info.english_name2,
      profession: info.profession,
      profession_en: info.profession_en,
      barcode_text: info.barcode_text,
      back_color: info.back_color,
      show_icon: info.show_icon,
      faction: info.faction,
    };

    const existingIdx = characters.findIndex((c) => c.id === info.id);
    if (existingIdx >= 0) {
      const updated = [...characters];
      updated[existingIdx] = newRecord;
      setCharacters(updated);
    } else {
      setCharacters([newRecord, ...characters]);
    }
  };

  const handleDeleteCharacter = (id: string) => {
    setCharacters(characters.filter((c) => c.id !== id));
  };

  const handleImportDatabase = (importedRecords: CharacterRecord[]) => {
    setCharacters(importedRecords);
    if (importedRecords.length > 0) {
      handleSelectCharacter(importedRecords[0]);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('确定将角色数据库与界面配置重置为初始内置样例数据吗？')) {
      setCharacters(DEFAULT_CHARACTERS);
      handleSelectCharacter(defaultChar);
    }
  };

  return (
    <div className="passcard-app min-h-screen bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Navbar / Header */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">
                PCB-PassCard-Generator
              </h1>

            </div>
          </div>

          <div className="flex items-center gap-3">
            <input ref={boardFileInput} type="file" accept=".zip,application/zip" aria-label="导入 PCB ZIP" hidden onChange={event=>{
              const file=event.target.files?.[0];event.target.value='';if(file)void handleImportPcb(file);
            }}/>
            <button type="button" disabled={importing} onClick={()=>boardFileInput.current?.click()} className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm">
              {importing?<Loader2 className="w-4 h-4 animate-spin"/>:<FolderOpen className="w-4 h-4"/>}{importing?'正在导入…':'导入已保存板'}
            </button>
            <button
              onClick={() => setIsBatchExportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl pcg-primary text-white font-medium text-xs sm:text-sm transition shadow-lg shadow-purple-500/20"
            >
              <Archive className="w-4 h-4" />
              导出
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {importError&&<p className="pcb-import-message pcb-error" role="alert">{importError}</p>}
        {importMessage&&!importedBoard&&<p className="pcb-import-message pcb-help" role="status">{importMessage}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Database Panel & Form Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            {importedBoard?<section className="pcb-import-summary" aria-labelledby="pcb-import-title">
              <h2 id="pcb-import-title"><FolderOpen size={19}/>已导入：{importedBoard.name}</h2>
              <p className="pcb-help">{importedBoard.notice}</p>
              <p className="pcb-help">已恢复{importedBoard.availableSides.map(side=>side==='front'?'正面':'背面').join('、')}，分辨率 590 × 1180 px。</p>
              <p className="pcb-help">右侧可查看成品、制造图层和 3D 模型，阻焊颜色可直接修改。</p>
              <button type="button" onClick={returnToTemplate}>返回模板编辑</button>
            </section>:<>
            {/* Database Panel */}
            <CharacterDatabasePanel
              characters={characters}
              activeCharacter={activeCharacter}
              mode={mode}
              onModeChange={setMode}
              onSelectCharacter={handleSelectCharacter}
              onSaveToDatabase={handleSaveToDatabase}
              onDeleteCharacter={handleDeleteCharacter}
              onImportDatabase={handleImportDatabase}
              onResetDefaultDatabase={() => {
                setCharacters(DEFAULT_CHARACTERS);
                handleSelectCharacter(defaultChar);
              }}
            />

            {/* Pass Card Editor Form */}
            <PassEditorForm
              info={info}
              e1Opts={e1Opts}
              frontPhotoUrl={frontPhotoUrl}
              cutoutPhotoUrl={cutoutPhotoUrl}
              customIconUrl={customIconUrl}
              onInfoChange={setInfo}
              onE1OptsChange={setE1Opts}
              onFrontPhotoUpload={handleFrontPhotoUpload}
              onCutoutPhotoUpload={handleCutoutPhotoUpload}
              onCustomIconUpload={handleCustomIconUpload}
              onClearCustomIcon={() => setCustomIconUrl('')}
              onOpenCropModal={() => setIsCropModalOpen(true)}
              onOpenIconAdjustModal={() => setPcbDetailRequest(value=>value+1)}
            />
            </>}
          </div>

          {/* Right Column: Live High-Res Canvas Preview (5 cols) */}
          <div className="pcb-preview-column lg:col-span-5 lg:sticky lg:top-20">
            <PcbPreview
              key={boardRevision}
              inputs={previewInputs}
              settings={pcbSettings}
              onChange={setPcbSettings}
              onE1OptsChange={setE1Opts}
              detailRequest={pcbDetailRequest}
              onExport={()=>setIsBatchExportModalOpen(true)}
              modelSize={modelSize}
              onModelSizeChange={setModelSize}
            />
          </div>
        </div>
      </main>

      {/* Modals */}
      <ImageCropperModal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        frontPhotoUrl={rawFrontPhotoUrl}
        cutoutPhotoUrl={rawCutoutPhotoUrl}
        onApplyCropped={(front, cutout) => {
          setFrontPhotoUrl(front);
          setCutoutPhotoUrl(cutout);
        }}
      />

      <PcbExportModal
        isOpen={isBatchExportModalOpen}
        onClose={() => setIsBatchExportModalOpen(false)}
        currentInfo={previewInputs.info}
        e1Opts={previewInputs.e1Opts}
        frontPhotoUrl={previewInputs.frontPhotoUrl}
        cutoutPhotoUrl={previewInputs.cutoutPhotoUrl}
        customIconUrl={previewInputs.customIconUrl}
        pcbSettings={pcbSettings}
        modelSize={modelSize}
        rawFrontPhotoUrl={importedBoard?undefined:rawFrontPhotoUrl}
        rawCutoutPhotoUrl={importedBoard?undefined:rawCutoutPhotoUrl}
        savedBoards={previewInputs.savedBoards}
        availableSides={importedBoard?.availableSides}
      />
    </div>
  );
}
