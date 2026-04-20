import re
with open('/Users/appointy/work/led-board/app/components/LEDBoard.new.tsx', 'r') as f:
    code = f.read()

code = code.replace("gridRef={gridRef}", "layerManagerRef={layerManagerRef}")

# We also need to fix applyTool and other methods that reference exportGetGridData
code = code.replace("exportGetGridData={() => gridRef.current?.data ? new Uint8ClampedArray(gridRef.current.data) : null}", 
                    "exportGetGridData={() => layerManagerRef.current ? layerManagerRef.current.composite() : null}")

# Replace gridRef usages where I missed before
code = code.replace("gridRef.current?.clear()", "layerManagerRef.current?.getActiveLayer()?.grid.clear()")
code = code.replace("const grid = gridRef.current;", "const grid = layerManagerRef.current?.getActiveLayer()?.grid;")
code = code.replace("if (!grid)", "if (!grid)")

with open('/Users/appointy/work/led-board/app/components/LEDBoard.tsx', 'w') as f:
    f.write(code)

