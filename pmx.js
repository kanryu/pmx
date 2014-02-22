///<reference path="./node.d.ts" />
/**
*  PMXファイルをparseし、JSON形式で吐き出すパーサ
*
* PMXとはMMDのモデル形式PMDから派生した3Dモデル用ファイルフォーマットで、PMXEditor等でサポートされています。
* http://kkhk22.seesaa.net/category/14045227-1.html
*
* 本ライブラリはPMXのモデルデータを解析し、他のモデル形式にコンバートしたり、
* ブラウザ上で直接取り扱えるようにするために開発されたpure JavaScript実装のパーサです。
*/
/**
*  スタック化されたポインタを持つバイナリストリーマ
*/
var BufferReader = (function () {
    function BufferReader(bin, position) {
        if (typeof position === "undefined") { position = 0; }
        this.bin = bin;
        this.pos_stack = [0];
        if (position)
            this.pos_stack[0] = position;
    }
    BufferReader.prototype.push_pos = function (pos) {
        this.pos_stack.unshift(pos);
    };
    BufferReader.prototype.pop_pos = function () {
        var result = this.pos_stack.shift();
        if (this.pos_stack.length == 0) {
            this.pos_stack[0] = result;
        }
        return result;
    };
    BufferReader.prototype.pos = function () {
        return this.pos_stack[0];
    };
    BufferReader.prototype.ahead = function (size) {
        var result = this.pos_stack[0];
        this.pos_stack[0] += size;
        return result;
    };
    BufferReader.prototype.readByte = function () {
        return this.bin.readUInt8(this.ahead(1));
    };
    BufferReader.prototype.readShort = function () {
        return this.bin.readUInt16LE(this.ahead(2));
    };
    BufferReader.prototype.readInt = function () {
        return this.bin.readUInt32LE(this.ahead(4));
    };
    BufferReader.prototype.readFloat = function () {
        return this.bin.readFloatLE(this.ahead(4));
    };
    BufferReader.prototype.readFloatArray = function (len) {
        var result = [];
        for (var i = 0; i < len; i++) {
            result.push(this.readFloat());
        }
        return result;
    };
    BufferReader.prototype.readFloat2 = function () {
        return this.readFloatArray(2);
    };
    BufferReader.prototype.readFloat3 = function () {
        return this.readFloatArray(3);
    };
    BufferReader.prototype.readFloat4 = function () {
        return this.readFloatArray(4);
    };
    BufferReader.prototype.readTextBuf = function (encode) {
        var textlen = this.readInt();
        var text = this.bin.toString(encode, this.pos(), this.pos() + textlen);
        this.pos_stack[0] += textlen;
        return new TextBuf(textlen, text);
    };
    BufferReader.prototype.readByteArray = function (len) {
        var result = [];
        for (var i = 0; i < len; i++) {
            result.push(this.readByte());
        }
        return result;
    };
    BufferReader.prototype.readShortArray = function (len) {
        var result = [];
        for (var i = 0; i < len; i++) {
            result.push(this.readShort());
        }
        return result;
    };
    BufferReader.prototype.readIntArray = function (len) {
        var result = [];
        for (var i = 0; i < len; i++) {
            result.push(this.readInt());
        }
        return result;
    };
    BufferReader.prototype.readSizedIdx = function (size, signed) {
        if (typeof signed === "undefined") { signed = true; }
        var result = -1;
        switch (size) {
            case 1:
                result = this.readByte();
                if (signed && result == 0xff)
                    result = -1;
                break;
            case 2:
                result = this.readShort();
                if (signed && result == 0xffff)
                    result = -1;
                break;
            case 4:
                result = this.readInt();
                if (signed && result == 0xffffffff)
                    result = -1;
                break;
        }
        return result;
    };
    return BufferReader;
})();
exports.BufferReader = BufferReader;

var TextBuf = (function () {
    function TextBuf(len, value) {
        this.len = len;
        this.value = value;
    }
    return TextBuf;
})();
exports.TextBuf = TextBuf;

/**
*  Vertex１つ分の情報を格納する
*/
var Vertex = (function () {
    function Vertex(reader, uv_append, bone_size) {
        this.uv_append = [];
        this.bones = [];
        this.weight = [];
        this.sdef = [];
        this.value = {};
        // 12 : float3  | 位置(x,y,z)
        this.pos = this.value['pos'] = reader.readFloat3();

        // 12 : float3  | 法線(x,y,z)
        this.norm = this.value['norm'] = reader.readFloat3();

        // 8  : float2  | UV(u,v)
        this.uv = this.value['uv'] = reader.readFloat2();

        //16 * n : float4[n] | 追加UV(x,y,z,w)  PMXヘッダの追加UV数による
        //n:追加UV数 0～4
        if (uv_append) {
            for (var i = 0; i < uv_append; i++) {
                this.uv_append.push(reader.readFloat4());
            }
            this.value['uv_append'] = this.uv_append;
        }

        // 1 : byte    | ウェイト変形方式 0:BDEF1 1:BDEF2 2:BDEF4 3:SDEF
        this.type = this.value['type'] = reader.readByte();
        switch (this.type) {
            case 0:
                // n : ボーンIndexサイズ  | ウェイト1.0の単一ボーン(参照Index)
                this.bones.push(reader.readSizedIdx(bone_size));
                this.value['bones'] = this.bones;
                break;
            case 1:
                for (var i = 0; i < 2; i++) {
                    this.bones.push(reader.readSizedIdx(bone_size));
                }
                this.value['bones'] = this.bones;

                //4 : float              | ボーン1のウェイト値(0～1.0), ボーン2のウェイト値は 1.0-ボーン1ウェイト
                this.weight.push(reader.readFloat());
                this.value['weight'] = this.weight;
                break;
            case 2:
                for (var i = 0; i < 4; i++) {
                    this.bones.push(reader.readSizedIdx(bone_size));
                }
                this.value['bones'] = this.bones;

                for (var i = 0; i < 4; i++) {
                    this.weight.push(reader.readFloat());
                }
                this.value['weight'] = this.weight;
                break;
            case 3:
                for (var i = 0; i < 2; i++) {
                    this.bones.push(reader.readSizedIdx(bone_size));
                }
                this.value['bones'] = this.bones;

                //  4 : float              | ボーン1のウェイト値(0～1.0), ボーン2のウェイト値は 1.0-ボーン1ウェイト
                this.weight.push(reader.readFloat());
                this.value['weight'] = this.weight;

                for (var i = 0; i < 3; i++) {
                    this.sdef.push(reader.readFloat3());
                }
                this.value['sdef'] = this.sdef;
                break;
        }
        this.edge = this.value['edge'] = reader.readFloat();
    }
    return Vertex;
})();
exports.Vertex = Vertex;

/**
*  面１つ分の情報を格納
*/
var Face = (function () {
    function Face(reader, vertex_size) {
        switch (vertex_size) {
            case 1:
                this.value = reader.readByteArray(3);
                break;
            case 2:
                this.value = reader.readShortArray(3);
                break;
            case 4:
                this.value = reader.readIntArray(3);
                break;
        }
    }
    return Face;
})();
exports.Face = Face;

/**
* 材質
*/
var Material = (function () {
    function Material(reader, encode, index_size) {
        this.value = {};
        // 4 + n : TextBuf	| 材質名
        this.name = this.value['name'] = reader.readTextBuf(encode);

        // 4 + n : TextBuf	| 材質名英
        this.name_en = this.value['name_en'] = reader.readTextBuf(encode);

        // 16 : float4	| Diffuse (R,G,B,A)
        this.diffuse = this.value['diffuse'] = reader.readFloat4();

        // 12 : float3	| Specular (R,G,B)
        this.specular = this.value['specular'] = reader.readFloat3();

        // 4  : float	| Specular係数
        this.specular_mod = this.value['specular_mod'] = reader.readFloat();

        // 12 : float3	| Ambient (R,G,B)
        this.ambient = this.value['ambient'] = reader.readFloat3();

        // 1  : bitFlag  	| 描画フラグ(8bit) - 各bit 0:OFF 1:ON
        //0x01:両面描画, 0x02:地面影, 0x04:セルフシャドウマップへの描画, 0x08:セルフシャドウの描画,
        //0x10:エッジ描画
        this.bit_flag = this.value['bit_flag'] = reader.readByte();

        // 16 : float4	| エッジ色 (R,G,B,A)
        this.edge_color = this.value['edge_color'] = reader.readFloat4();

        // 4  : float	| エッジサイズ
        this.edge_size = this.value['edge_size'] = reader.readFloat();

        // n  : テクスチャIndexサイズ     | 通常テクスチャ, テクスチャテーブルの参照Index
        this.textureIdx = this.value['textureIdx'] = reader.readSizedIdx(index_size);

        // n  : テクスチャIndexサイズ     | スフィアテクスチャ, テクスチャテーブルの参照Index  ※テクスチャ拡張子の制限なし
        this.sphereIdx = this.value['sphereIdx'] = reader.readSizedIdx(index_size);

        // 1  : byte	| スフィアモード 0:無効 1:乗算(sph) 2:加算(spa) 3:サブテクスチャ
        this.sphere_mode = this.value['sphere_mode'] = reader.readByte();

        // 1  : byte	| 共有Toonフラグ 0:継続値は個別Toon 1:継続値は共有Toon
        this.shared_toon = this.value['shared_toon'] = reader.readByte();

        // shared toon idx, or specialized toon texture idx
        this.toon = this.value['toon'] = this.shared_toon ? reader.readByte() : reader.readSizedIdx(index_size);

        // 4 + n : TextBuf	| メモ : 自由欄／スクリプト記述／エフェクトへのパラメータ配置など
        this.memo = this.value['memo'] = reader.readTextBuf(encode);

        // 4  : int	| 材質に対応する面(頂点)数 (必ず3の倍数になる)
        this.refs_vertex = this.value['refs_vertex'] = reader.readInt();
    }
    return Material;
})();
exports.Material = Material;

/**
* ボーン
*/
var Bone = (function () {
    function Bone(reader, encode, bone_size) {
        this.value = {};
        //4 + n : TextBuf	| ボーン名
        this.name = this.value['name'] = reader.readTextBuf(encode);

        //4 + n : TextBuf	| ボーン名英
        this.name_en = this.value['name_en'] = reader.readTextBuf(encode);

        //12 : float3	| 位置
        this.position = this.value['position'] = reader.readFloat3();

        //n  : ボーンIndexサイズ  | 親ボーンのボーンIndex
        this.parent_idx = this.value['parent_idx'] = reader.readSizedIdx(bone_size);

        //4  : int		| 変形階層
        this.morph_idx = this.value['morph_idx'] = reader.readInt();

        //2  : bitFlag*2	| ボーンフラグ(16bit) 各bit 0:OFF 1:ON
        // 0x0001  : 接続先(PMD子ボーン指定)表示方法 -> 0:座標オフセットで指定 1:ボーンで指定
        // 0x0002  : 回転可能
        // 0x0004  : 移動可能
        // 0x0008  : 表示
        // 0x0010  : 操作可
        // 0x0020  : IK
        // 0x0080  : ローカル付与 | 付与対象 0:ユーザー変形値／IKリンク／多重付与 1:親のローカル変形量
        // 0x0100  : 回転付与
        // 0x0200  : 移動付与
        // 0x0400  : 軸固定
        // 0x0800  : ローカル軸
        // 0x1000  : 物理後変形
        // 0x2000  : 外部親変形
        this.bit_flag = this.value['bit_flag'] = reader.readShort();

        if (this.bit_flag & 0x1) {
            // n  : ボーンIndexサイズ  | 接続先ボーンのボーンIndex
            this.connect_idx = this.value['connect_idx'] = reader.readSizedIdx(bone_size);
        } else {
            // 12 : float3	| 座標オフセット, ボーン位置からの相対分
            this.offset = this.value['offset'] = reader.readFloat3();
        }

        if (this.bit_flag & 0x0300) {
            // n  : ボーンIndexサイズ  | 付与親ボーンのボーンIndex
            this.invest_parent_idx = this.value['invest_parent_idx'] = reader.readSizedIdx(bone_size);

            // 4  : float	| 付与率
            this.invest_rate = this.value['invest_rate'] = reader.readFloat();
        }
        if (this.bit_flag & 0x0400) {
            // 12 : float3	| 軸の方向ベクトル
            this.axis_vector = this.value['axis_vector'] = reader.readFloat3();
        }
        if (this.bit_flag & 0x0800) {
            // 12 : float3	| X軸の方向ベクトル
            this.x_axis_vector = this.value['x_axis_vector'] = reader.readFloat3();

            // 12 : float3	| Z軸の方向ベクトル ※フレーム軸算出方法は後述
            this.z_axis_vector = this.value['z_axis_vector'] = reader.readFloat3();
        }
        if (this.bit_flag & 0x2000) {
            //  4  : int  	| Key値
            this.parent_key = this.value['parent_key'] = reader.readInt();
        }
        if (this.bit_flag & 0x0020) {
            // n  : ボーンIndexサイズ  | IKターゲットボーンのボーンIndex
            this.ik_target_idx = this.value['ik_target_idx'] = reader.readSizedIdx(bone_size);

            // 4  : int  	| IKループ回数 (PMD及びMMD環境では255回が最大になるようです)
            this.ik_loop_len = this.value['ik_loop_len'] = reader.readInt();

            // 4  : float	| IKループ計算時の1回あたりの制限角度 -> ラジアン角 | PMDのIK値とは4倍異なるので注意
            this.ik_rad_limited = this.value['ik_rad_limited'] = reader.readFloat();

            // 4  : int  	| IKリンク数 : 後続の要素数
            this.ik_linkLen = this.value['ik_linkLen'] = reader.readInt();
            this.ik_links = [];
            for (var i = 0; i < this.ik_linkLen; i++) {
                var ik_link = {
                    //   n  : ボーンIndexサイズ  | リンクボーンのボーンIndex
                    'link_idx': reader.readSizedIdx(bone_size)
                };

                //   1  : byte	| 角度制限 0:OFF 1:ON
                ik_link['rad_limited'] = reader.readByte();
                if (ik_link['rad_limited']) {
                    // 12 : float3	| 下限 (x,y,z) -> ラジアン角
                    ik_link['lower_vector'] = reader.readFloat3();

                    // 12 : float3	| 上限 (x,y,z) -> ラジアン角
                    ik_link['upper_vector'] = reader.readFloat3();
                }
                this.ik_links.push(ik_link);
            }
            this.value['ik_links'] = this.ik_links;
        }
    }
    return Bone;
})();
exports.Bone = Bone;

/**
* モーフ
*/
var Morph = (function () {
    function Morph(reader, encode, vertex_size, material_size, bone_size, morph_size) {
        this.value = {};
        this.offset_data = [];
        // 4 + n : TextBuf	| モーフ名
        this.name = this.value['name'] = reader.readTextBuf(encode);

        // 4 + n : TextBuf	| モーフ名英
        this.name_en = this.value['name_en'] = reader.readTextBuf(encode);

        // 1  : byte	| 操作パネル (PMD:カテゴリ) 1:眉(左下) 2:目(左上) 3:口(右上) 4:その他(右下)  | 0:システム予約
        this.panel = this.value['panel'] = reader.readByte();

        // 1  : byte	| モーフ種類 - 0:グループ, 1:頂点, 2:ボーン, 3:UV, 4:追加UV1, 5:追加UV2, 6:追加UV3, 7:追加UV4, 8:材質
        this.type = this.value['type'] = reader.readByte();

        // 4  : int  	| モーフのオフセット数 : 後続の要素数
        this.offset_count = this.value['offset_count'] = reader.readInt();
        var offset_data = [];
        for (var i = 0; i < this.offset_count; i++) {
            var offset = {};
            switch (this.type) {
                case 0:
                    //n  : モーフIndexサイズ  | モーフIndex  ※仕様上グループモーフのグループ化は非対応とする
                    this.morph_idx = offset['morph_idx'] = reader.readSizedIdx(morph_size);

                    //4  : float	| モーフ率 : グループモーフのモーフ値 * モーフ率 = 対象モーフのモーフ値
                    this.morph_rate = offset['morph_rate'] = reader.readFloat();
                    break;
                case 1:
                    //n  : 頂点Indexサイズ  | 頂点Index
                    this.vertex_idx = offset['vertex_idx'] = reader.readSizedIdx(vertex_size);

                    //12 : float3	| 座標オフセット量(x,y,z)
                    this.coodinate_offset = offset['coodinate_offset'] = reader.readFloat3();
                    break;
                case 2:
                    //n  : ボーンIndexサイズ  | ボーンIndex
                    this.bone_idx = offset['bone_idx'] = reader.readSizedIdx(bone_size);

                    //12 : float3	| 移動量(x,y,z)
                    this.distance = offset['distance'] = reader.readFloat3();

                    //16 : float4	| 回転量-クォータニオン(x,y,z,w)
                    this.turning = offset['turning'] = reader.readFloat4();
                    break;
                case 3:
                case 4:
                case 5:
                case 6:
                case 7:
                    //n  : 頂点Indexサイズ  | 頂点Index
                    this.vertex_idx = offset['vertex_idx'] = reader.readSizedIdx(vertex_size);

                    //16 : float4	| UVオフセット量(x,y,z,w) ※通常UVはz,wが不要項目になるがモーフとしてのデータ値は記録しておく
                    this.uv_offset = offset['uv_offset'] = reader.readFloat4();
                    break;
                case 8:
                    //n  : 材質Indexサイズ  | 材質Index -> -1:全材質対象
                    this.material_idx = offset['material_idx'] = reader.readSizedIdx(material_size);

                    //1  : オフセット演算形式 | 0:乗算, 1:加算 - 詳細は後述
                    this.offset_type = offset['offset_type'] = reader.readByte();

                    //16 : float4	| Diffuse (R,G,B,A) - 乗算:1.0／加算:0.0 が初期値となる(同以下)
                    this.diffuse = offset['diffuse'] = reader.readFloat4();

                    //12 : float3	| Specular (R,G,B)
                    this.specular = offset['specular'] = reader.readFloat3();

                    //4  : float	| Specular係数
                    this.specular_mod = offset['specular_mod'] = reader.readFloat();

                    //12 : float3	| Ambient (R,G,B)
                    this.ambient = offset['ambient'] = reader.readFloat3();

                    //16 : float4	| エッジ色 (R,G,B,A)
                    this.edge_color = offset['edge_color'] = reader.readFloat4();

                    //4  : float	| エッジサイズ
                    this.edge_size = offset['edge_size'] = reader.readFloat();

                    //16 : float4	| テクスチャ係数 (R,G,B,A)
                    this.texture_mod = offset['texture_mod'] = reader.readFloat4();

                    //16 : float4	| スフィアテクスチャ係数 (R,G,B,A)
                    this.sphere_mod = offset['sphere_mod'] = reader.readFloat4();

                    //16 : float4	| Toonテクスチャ係数 (R,G,B,A)
                    this.toon_mod = offset['toon_mod'] = reader.readFloat4();
                    break;
            }
            this.offset_data.push(offset);
        }
        this.value['offset_data'] = this.offset_data;
    }
    return Morph;
})();
exports.Morph = Morph;

/**
* 表示枠
*/
var Frame = (function () {
    function Frame(reader, encode, bone_size, morph_size) {
        this.inner_data = [];
        this.value = {};
        // 4 + n : TextBuf	| 枠名
        this.name = this.value['name'] = reader.readTextBuf(encode);

        // 4 + n : TextBuf	| 枠名英
        this.name_en = this.value['name_en'] = reader.readTextBuf(encode);

        // 1  : byte	| 特殊枠フラグ - 0:通常枠 1:特殊枠
        this.flag = this.value['flag'] = reader.readByte();

        // 4  : int  	| 枠内要素数 : 後続の要素数
        this.inner_count = this.value['inner_count'] = reader.readInt();
        for (var i = 0; i < this.inner_count; i++) {
            var inner = {};

            // 1 : byte	| 要素対象 0:ボーン 1:モーフ
            inner['type'] = reader.readByte();
            if (inner['type']) {
                //n  : モーフIndexサイズ  | モーフIndex
                inner['morph_idx'] = reader.readSizedIdx(morph_size);
            } else {
                //n  : ボーンIndexサイズ  | ボーンIndex
                inner['bone_idx'] = reader.readSizedIdx(bone_size);
            }
            this.inner_data.push(inner);
        }
        this.value['inner_data'] = this.inner_data;
    }
    return Frame;
})();
exports.Frame = Frame;

/**
* 剛体
*/
var RigidBody = (function () {
    function RigidBody(reader, encode, bone_size, morph_size) {
        this.value = {};
        // 4 + n : TextBuf	| 剛体名
        this.name = this.value['name'] = reader.readTextBuf(encode);

        // 4 + n : TextBuf	| 剛体名英
        this.name_en = this.value['name_en'] = reader.readTextBuf(encode);

        // n  : ボーンIndexサイズ  | 関連ボーンIndex - 関連なしの場合は-1
        this.bone_idx = this.value['bone_idx'] = reader.readSizedIdx(bone_size);

        // 1  : byte	| グループ
        this.group = this.value['group'] = reader.readByte();

        //2  : ushort	| 非衝突グループフラグ
        this.nocollision_group = this.value['nocollision_group'] = reader.readSizedIdx(2);

        //1  : byte	| 形状 - 0:球 1:箱 2:カプセル
        this.figure = this.value['figure'] = reader.readByte();

        //12 : float3	| サイズ(x,y,z)
        this.size = this.value['size'] = reader.readFloat3();

        //12 : float3	| 位置(x,y,z)
        this.position = this.value['position'] = reader.readFloat3();

        //12 : float3	| 回転(x,y,z) -> ラジアン角
        this.rad = this.value['rad'] = reader.readFloat3();

        //4  : float	| 質量
        this.mass = this.value['mass'] = reader.readFloat();

        //4  : float	| 移動減衰
        this.moving_att = this.value['moving_att'] = reader.readFloat();

        //4  : float	| 回転減衰
        this.rad_att = this.value['moving_att'] = reader.readFloat();

        //4  : float	| 反発力
        this.bounce_force = this.value['bounce_force'] = reader.readFloat();

        //4  : float	| 摩擦力
        this.frictical_force = this.value['frictical_force'] = reader.readFloat();

        //
        //1  : byte	| 剛体の物理演算 - 0:ボーン追従(static) 1:物理演算(dynamic) 2:物理演算 + Bone位置合わせ
        this.mode = this.value['mode'] = reader.readByte();
    }
    return RigidBody;
})();
exports.RigidBody = RigidBody;

/**
* Joint
*/
var Joint = (function () {
    function Joint(reader, encode) {
        this.value = {};
        // 4 + n : TextBuf	| Joint名
        this.name = this.value['name'] = reader.readTextBuf(encode);

        // 4 + n : TextBuf	| Joint名英
        this.name_en = this.value['name_en'] = reader.readTextBuf(encode);

        // 1  : byte	| Joint種類 - 0:スプリング6DOF   | PMX2.0では 0 のみ(拡張用)
        this.type = this.value['type'] = reader.readByte();
        if (this.type) {
            throw new Error('not implemented');
        }

        //n  : 剛体Indexサイズ  | 関連剛体AのIndex - 関連なしの場合は-1
        this.rigid_a_idx = this.value['rigid_a_idx'] = reader.readByte();

        //n  : 剛体Indexサイズ  | 関連剛体BのIndex - 関連なしの場合は-1
        this.rigid_b_idx = this.value['rigid_b_idx'] = reader.readByte();

        //12 : float3	| 位置(x,y,z)
        this.position = this.value['position'] = reader.readFloat3();

        //12 : float3	| 回転(x,y,z) -> ラジアン角
        this.rad = this.value['rad'] = reader.readFloat3();

        //12 : float3	| 移動制限-下限(x,y,z)
        this.position_lower_vector = this.value['position_lower_vector'] = reader.readFloat3();

        //12 : float3	| 移動制限-上限(x,y,z)
        this.position_upper_vector = this.value['position_upper_vector'] = reader.readFloat3();

        //12 : float3	| 回転制限-下限(x,y,z) -> ラジアン角
        this.rad_lower_vector = this.value['rad_lower_vector'] = reader.readFloat3();

        //12 : float3	| 回転制限-上限(x,y,z) -> ラジアン角
        this.rad_upper_vector = this.value['rad_upper_vector'] = reader.readFloat3();

        //
        //12 : float3	| バネ定数-移動(x,y,z)
        this.baunce_moving = this.value['baunce_moving'] = reader.readFloat3();

        //12 : float3	| バネ定数-回転(x,y,z)
        this.baunce_rad = this.value['baunce_rad'] = reader.readFloat3();
    }
    return Joint;
})();
exports.Joint = Joint;

var Pmx = (function () {
    function Pmx(bin, callback) {
        this.log = [];
        this.value = {};
        this.push(bin.toString('ascii', 0, 4));

        var reader = new BufferReader(bin, 4);
        var version = reader.readFloat();
        var headersize = reader.readByte();
        this.push(version);
        this.push(headersize);

        var encodeId = reader.readByte();
        var encode = encodeId ? 'utf8' : 'utf16le';
        this.push('encode', encode);
        var uv_append = reader.readByte();
        this.push('uv', uv_append);
        var vertex_size = reader.readByte();
        this.push('vertex', vertex_size);
        var texture_size = reader.readByte();
        this.push('texture', texture_size);
        var material_size = reader.readByte();
        this.push('material', material_size);
        var bone_size = reader.readByte();
        this.push('bone', bone_size);
        var morph_size = reader.readByte();
        this.push('morph', morph_size);
        this.push('rigidbody', reader.readByte());

        var idx = 17;
        reader.push_pos(17);
        var model = reader.readTextBuf(encode);
        var modelEn = reader.readTextBuf(encode);
        var comment = reader.readTextBuf(encode);
        var commentEn = reader.readTextBuf(encode);
        var vertexLen = reader.readInt();

        this.push('modelname', model.value);
        this.push('modelname_en', modelEn.value);
        this.push('comment', comment.value);
        this.push('comment_en', commentEn.value);
        this.push('VertexLen', vertexLen);

        // vertex
        var vertex_list = [];
        for (var i = 0; i < vertexLen; i++) {
            var vertex = new Vertex(reader, uv_append, bone_size);
            vertex_list.push(vertex.value);
        }
        this.push('veretex', vertex_list);

        // faces
        var faceLen = reader.readInt();
        var face_list = [];
        this.push('face', faceLen);
        for (var i = 0; i < faceLen / 3; i++) {
            var face = new Face(reader, vertex_size);
            face_list.push(face.value);
        }
        this.push('face', face_list);

        var textureLen = reader.readInt();
        var textures = [];
        for (var i = 0; i < textureLen; i++) {
            // 4 + n : TextBuf	| テクスチャパス
            var texture = reader.readTextBuf(encode);
            textures.push(texture.value);
        }
        this.push('texture', textures);

        // Materials
        var materialLen = reader.readInt();
        var materials = [];
        for (var i = 0; i < materialLen; i++) {
            var material = new Material(reader, encode, texture_size);
            var m = material.value;
            materials.push(m);
        }
        this.push('material', materials);

        // Bones
        var boneLen = reader.readInt();
        var bones = [];
        for (var i = 0; i < boneLen; i++) {
            var bone = new Bone(reader, encode, bone_size);
            var m = bone.value;
            bones.push(m);
        }
        this.push('bones', bones);

        // Morphs
        var morphLen = reader.readInt();
        var morphs = [];
        for (var i = 0; i < morphLen; i++) {
            var morph = new Morph(reader, encode, vertex_size, material_size, bone_size, morph_size);
            var m = morph.value;
            morphs.push(m);
        }
        this.push('morphs', morphs);

        // Frames
        var frameLen = reader.readInt();
        var frames = [];
        for (var i = 0; i < frameLen; i++) {
            var frame = new Frame(reader, encode, bone_size, morph_size);
            var m = frame.value;
            frames.push(m);
        }
        this.push('frames', frames);

        // RigidBodys
        var rigidLen = reader.readInt();
        var rigids = [];
        for (var i = 0; i < rigidLen; i++) {
            var rigid = new RigidBody(reader, encode, bone_size, morph_size);
            var m = rigid.value;
            rigids.push(m);
        }
        this.push('rigids', rigids);

        // Joint
        var jointLen = reader.readInt();
        var joints = [];
        for (var i = 0; i < jointLen; i++) {
            var joint = new Joint(reader, encode);
            var m = joint.value;
            joints.push(m);
        }
        this.push('joints', joints);
    }
    Pmx.prototype.push = function (key, value, assigned) {
        if (typeof assigned === "undefined") { assigned = true; }
        if (value == undefined) {
            this.log.push(key);
        } else {
            if (assigned) {
                this.value[key] = value;
            }
            this.log.push([key, value]);
        }
    };
    return Pmx;
})();
exports.Pmx = Pmx;

var Parser = (function () {
    function Parser() {
    }
    Parser.parse = function (bin, callback) {
        var pmx = new Pmx(bin, callback);
        if (callback) {
            callback(null, pmx.value);
        }
        return pmx;
    };
    return Parser;
})();
exports.Parser = Parser;
