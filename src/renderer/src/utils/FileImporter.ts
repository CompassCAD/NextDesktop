import { GraphicsRenderer } from "../engine/Engine";
import { convertDxfToCompassCad } from "./dxfparse";

export const openFileAndParse = async (renderer: GraphicsRenderer): Promise<void> => {
  const file = await window.api.showOpenFileDialog({
    title: 'Open a CompassCAD file/import a non-CompassCAD file',
    filters: [
      // { name: 'CompassCAD NEXT Files', extensions: ['cnext'] }, <- Still haven't planned on .cnext (could be an SQLite file ig)
      { name: 'CompassCAD Files', extensions: ['ccad'] },
      { name: 'QroCAD Files', extensions: ["qrocad", "qrocad2"] },
      { name: 'AutoCAD DXF', extensions: ["dxf"] }
    ]
  });
  console.log(file);
  if (file != undefined) {
    console.log(file);
    const filePath = file[0];
    const fileContent = window.api.readFile(filePath);
    try {
      let parsedData: any;
      if (filePath.includes('ccad') || filePath.includes('qrocad') || filePath.includes('qrocad2')) {
        parsedData = JSON.parse(fileContent);
      } else if (filePath.includes('dxf')) {
        parsedData = convertDxfToCompassCad(fileContent, {
          scale: 10,
          flipY: true
        })
      }
      renderer!.logicDisplay!.components = [];
      renderer?.cleanUpBeforeImport();
      renderer!.logicDisplay?.importJSON(parsedData, renderer!.logicDisplay.components);
      renderer?.postDoAfterComponentImport();
    } catch (e) {
      console.error('[windowbar] failed to open file: ', e);
    }
  }
}
