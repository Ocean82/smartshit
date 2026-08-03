Title: SpreadsheetLLM: Encoding Spreadsheets for Large Language Models

URL Source: https://arxiv.org/html/2407.09025

Published Time: Thu, 03 Apr 2025 00:58:39 GMT

Markdown Content:
Haoyu Dong, Jianbo Zhao 2 2 footnotemark: 2, Yuzhang Tian 2 2 footnotemark: 2 3 3 footnotemark: 3, Junyu Xiong 2 2 footnotemark: 2 3 3 footnotemark: 3, Shiyu Xia 3 3 footnotemark: 3, 

Mengyu Zhou, Yun Lin 3 3 footnotemark: 3, José Cambronero, Yeye He, Shi Han, Dongmei Zhang

Microsoft Corporation Corresponding author (hadong@microsoft.com).Equal contribution.Work during internship at Microsoft.

###### Abstract

Spreadsheets are characterized by their extensive two-dimensional grids, flexible layouts, and varied formatting options, which pose significant challenges for large language models (LLMs). In response, we introduce SpreadsheetLLM, pioneering an efficient encoding method designed to unleash and optimize LLMs’ powerful understanding and reasoning capability on spreadsheets. Initially, we propose a vanilla serialization approach that incorporates cell addresses, values, and formats. However, this approach was limited by LLMs’ token constraints, making it impractical for most applications. To tackle this challenge, we develop SheetCompressor, an innovative encoding framework that compresses spreadsheets effectively for LLMs. It comprises three modules: structural-anchor-based compression, inverse index translation, and data-format-aware aggregation. It significantly improves performance in the spreadsheet table detection task, outperforming the vanilla approach by 25.6% in GPT4’s in-context learning setting. Moreover, fine-tuned LLM with SheetCompressor has an average compression ratio of 25×, and achieves a state-of-the-art 78.9% F1 score, surpassing the best existing models by 12.3%. Finally, we propose Chain of Spreadsheet for downstream tasks of spreadsheet understanding and validate it in a new and demanding spreadsheet QA task. We methodically leverage the inherent layout and structure of spreadsheets, demonstrating that SpreadsheetLLM is highly effective across a variety of spreadsheet tasks.

SpreadsheetLLM: Encoding Spreadsheets for Large Language Models

Haoyu Dong††thanks: Corresponding author (hadong@microsoft.com).††thanks: Equal contribution., Jianbo Zhao 2 2 footnotemark: 2††thanks: Work during internship at Microsoft., Yuzhang Tian 2 2 footnotemark: 2 3 3 footnotemark: 3, Junyu Xiong 2 2 footnotemark: 2 3 3 footnotemark: 3, Shiyu Xia 3 3 footnotemark: 3,Mengyu Zhou, Yun Lin 3 3 footnotemark: 3, José Cambronero, Yeye He, Shi Han, Dongmei Zhang Microsoft Corporation

![Image 1: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/overview.png)

Figure 1: The SpreadsheetLLM pipeline.

1 Introduction
--------------

Spreadsheets are ubiquitous for data management and extensively utilized within platforms like Microsoft Excel and Google Sheets. Understanding spreadsheet layout and structure Dong et al. ([2019b](https://arxiv.org/html/2407.09025v2#bib.bib13)); Gol et al. ([2019](https://arxiv.org/html/2407.09025v2#bib.bib18)); Hulsebos et al. ([2019](https://arxiv.org/html/2407.09025v2#bib.bib20)); Dou et al. ([2018](https://arxiv.org/html/2407.09025v2#bib.bib15)); Wang et al. ([2021](https://arxiv.org/html/2407.09025v2#bib.bib38)); Deng et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib10)); Chen and Cafarella ([2014](https://arxiv.org/html/2407.09025v2#bib.bib4)), a longstanding challenge for traditional models, is crucial for effective data analysis and intelligent user interaction. Recently, the rapid development of Large Language Models (LLMs) has opened new frontiers in table processing Li et al. ([2023b](https://arxiv.org/html/2407.09025v2#bib.bib27)) and reasoning Cheng et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib7)). However, spreadsheets pose unique challenges for LLMs due to their expansive grids that usually exceed the token limitations of popular LLMs, as well as their inherent two-dimensional layouts and structures, which are poorly suited to linear and sequential input. Furthermore, LLMs often struggle with spreadsheet-specific features such as cell addresses and formats, complicating their ability to effectively parse and utilize spreadsheet data, as detailed in Appendix [A](https://arxiv.org/html/2407.09025v2#A1 "Appendix A GPT4 Struggles to Understand Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

In this paper, we introduce SpreadsheetLLM, a pioneering framework to unleash and maximize the potential of LLMs for spreadsheet understanding and reasoning. We initially propose a vanilla encoding method to serialize spreadsheets into sequences, augmenting the Markdown encoding method by including essential cell addresses and (optional) formats. Furthermore, large spreadsheets that exceed the token limits of LLMs not only limit their processing but also, as observed in prior studies, degrade accuracy performance as the size increases Liu et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib29)). To address this challenge, we propose SheetCompressor, featuring a novel encoding framework comprising three portable modules:

1) Structural Anchors for Efficient Layout Understanding: Observations indicate that large spreadsheets often contain numerous homogeneous rows or columns, which contribute minimally to understanding the layout and structure (see left panel in Figure[2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") (a)). To address this, we identify structural anchors—heterogeneous rows and columns at possible table boundaries that offer substantial layout insights, as depicted in Figure[2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") (b). Then we remove distant, homogeneous rows and columns, producing a condensed "skeleton" version of the spreadsheet, as illustrated in Figure[2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") (c).

2) Inverted-Index Translation for Token Efficiency: The vanilla encoding method becomes token-consuming when handling spreadsheets with numerous empty cells and repetitive values, as shown in Figure[2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") (c). To improve efficiency, we depart from traditional row-by-row and column-by-column serialization and employ a lossless inverted-index translation in JSON format. This method creates a dictionary that indexes non-empty cell texts and merges addresses with identical text, optimizing token usage while preserving data integrity.

3) Data Format Aggregation for Numerical Cells: Adjacent numerical cells often share similar number formats. Recognizing that exact numerical values are less crucial for grasping spreadsheet structure, we extract number format strings and data types from these cells. Then adjacent cells with the same formats or types are clustered together. This method is visualized in the right example of Figure[2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), where rectangular regions are represented by uniform format strings and data types, streamlining the understanding of numerical data distribution without excessive token expenditure.

We conducted a comprehensive evaluation of our method on a variety of LLMs. Our experiments show that SheetCompressor significantly reduces token usage for spreadsheet encoding by 96%. Moreover, SpreadsheetLLM has shown exceptional performance in spreadsheet table detection, the foundational task of spreadsheet understanding, surpassing the previous SOTA method by 12.3%Dong et al. ([2019b](https://arxiv.org/html/2407.09025v2#bib.bib13)). We also applied SpreadsheetLLM to a representative spreadsheet QA task. Inspired by the Chain of Thought (CoT) methodology Zheng et al. ([2023](https://arxiv.org/html/2407.09025v2#bib.bib43)); Jiang et al. ([2023b](https://arxiv.org/html/2407.09025v2#bib.bib22)), we propose Chain of Spreadsheet (CoS) to decompose spreadsheet reasoning into a table detection-match-reasoning pipeline. It significantly outperformed existing SOTA methods for table QA Liu et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib30)); Cheng et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib7)). Our primary contributions are summarized as follows:

*   •We propose SpreadsheetLLM, the first work that substantially leverage LLMs for understanding and analyzing spreadsheet data. To address challenges in scale, diversity, and complexity of spreadsheets, we propose SheetCompressor, an innovative encoding framework to compress spreadsheets for LLMs with efficient encoding. 
*   •We fine-tune a variety of cutting-edge LLMs to achieve optimal performance on spreadsheet table detection and demonstrate the high effectiveness of SpreadsheetLLM in accurately understanding complex spreadsheet layouts and structures. 
*   •In order to extend the horizontal capabilities of SpreadsheetLLM to a wide range of downstream tasks, we propose CoS and verify it on Spreadsheet QA, highlighting its potential for intelligent user interaction. 

![Image 2: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/method-new.png)

Figure 2: Illustration of the SheetCompressor framework. The original spreadsheet contains two tables, featuring numerous data entries or hierarchical headers. The completed spreadsheet consists of 576 rows and 23 columns, with a vanilla encoding of 61,240 tokens. Initially, we first extract cells using structural anchors, rearranging them into a smaller 24×8 sheet. Subsequently, we perform index-invert, removing empty cells. Finally, we aggregate cells based on data formats, achieving an extremely compact representation of the spreadsheet with only 708 tokens.

2 Related Work
--------------

##### Spreadsheet Representation

Spreadsheet representation involves converting the spreadsheets into specific representations for different models. There are various methods for spreadsheet (table) representation. Dong et al. ([2019a](https://arxiv.org/html/2407.09025v2#bib.bib12), [b](https://arxiv.org/html/2407.09025v2#bib.bib13)) enhance Mask-RCNN to leverage spatial and visual information in spreadsheets, and Deng et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib9)) explores the usage of LLMs to evaluate image tables, but it doesn’t work well for spreadsheet images as input to VLMs Xia et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib39)). To capture sequential semantics in rows and columns, LSTMs are further adopted Nishida et al. ([2017](https://arxiv.org/html/2407.09025v2#bib.bib31)); Gol et al. ([2019](https://arxiv.org/html/2407.09025v2#bib.bib18)) in row&column directions. Pre-trained LMs Dong et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib11)) are then proposed to understand spreadsheets Wang et al. ([2021](https://arxiv.org/html/2407.09025v2#bib.bib38)). Recent studies Zhang et al. ([2023](https://arxiv.org/html/2407.09025v2#bib.bib41)); Li et al. ([2023b](https://arxiv.org/html/2407.09025v2#bib.bib27)); Sui et al. ([2023](https://arxiv.org/html/2407.09025v2#bib.bib33)) have explored the efficacy of using Markdown, HTML, JSON, and DFLoader for table representation, and these methods are comprehensively summarized in a recent tutorial of Dong and Wang ([2024](https://arxiv.org/html/2407.09025v2#bib.bib14)). However, traditional table representations are not well suited to spreadsheets due to their assumption of single table input and absence of explicit cell addresses, as experiments show in Appendix[B](https://arxiv.org/html/2407.09025v2#A2 "Appendix B Traditional Encoding Methods for Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

##### Spreadsheet Understanding

While most table LLMs are restricted to single table settings, spreadsheets with multiple tables typically exceed token limits. Moreover, the diversity in multi-table layout and structure significantly confounds the problem. Spreadsheet table detection Dong et al. ([2019b](https://arxiv.org/html/2407.09025v2#bib.bib13)); Christodoulakis et al. ([2020](https://arxiv.org/html/2407.09025v2#bib.bib8)); Doush and Pontelli ([2010](https://arxiv.org/html/2407.09025v2#bib.bib17)); Vitagliano et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib35)) aims at identifying all tables on a given sheet and determining their respective ranges. As a fundamental task for spreadsheet understanding, this task triggers hundreds of millions of daily average usage in commercial spreadsheet tools Zhang et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib42)), and the accuracy still urges improvements due to the flexibility and complexity of spreadsheets.

##### Spreadsheet Downstream Tasks

Spreadsheet understanding is enabling for a series of spreadsheet tasks, such as table question answering analysis He et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib19)); Cheng et al. ([2021b](https://arxiv.org/html/2407.09025v2#bib.bib6), [2022](https://arxiv.org/html/2407.09025v2#bib.bib7)); Jiang et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib23)); Liu et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib30)), table extraction Chen and Cafarella ([2013](https://arxiv.org/html/2407.09025v2#bib.bib3), [2014](https://arxiv.org/html/2407.09025v2#bib.bib4)); Li et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib26)), formula or code generation Chen et al. ([2021](https://arxiv.org/html/2407.09025v2#bib.bib2)); Cheng et al. ([2021a](https://arxiv.org/html/2407.09025v2#bib.bib5)); Joshi et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib24)); Chen et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib1)); Li et al. ([2023a](https://arxiv.org/html/2407.09025v2#bib.bib25)), error detection Wang and He ([2019](https://arxiv.org/html/2407.09025v2#bib.bib36)); Dou et al. ([2016](https://arxiv.org/html/2407.09025v2#bib.bib16)), etc. In this paper, we choose spreadsheet QA, one of the most demanded spreadsheet analysis tasks. It is an extension of the Table QA task in spreadsheet data, with the additional complexity of detecting and matching multiple tables within a spreadsheet.

##### LLMs’ Token Efficiency

Related work suggests that the performance of LLMs degrades significantly with long contexts Liu et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib29)); Xu et al. ([2023](https://arxiv.org/html/2407.09025v2#bib.bib40)). Efforts to improve model performance and reduce costs have led to the development of compression techniques for long prompts. Some researchers employ information-theory metrics to filter out redundant information Li ([2023](https://arxiv.org/html/2407.09025v2#bib.bib28)); Jiang et al. ([2023a](https://arxiv.org/html/2407.09025v2#bib.bib21)). Additionally, specialized models have been proposed to optimize prompt compression Pan et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib32)). However, these strategies primarily address natural language prompts and may not suit tabular data, potentially leading to considerable structure and data information loss. DBCopilot Wang et al. ([2023](https://arxiv.org/html/2407.09025v2#bib.bib37)) enables text-to-SQL conversion on large databases through schema routing. However, due to LLMs’ insufficient ability to understand inherent multi-table layouts and complex table structures that cannot execute queries similar to SQL, schema routing is impractical, restricting the broader application of cutting-edge tabular works Cheng et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib7)); Li et al. ([2023b](https://arxiv.org/html/2407.09025v2#bib.bib27)); Sui et al. ([2024](https://arxiv.org/html/2407.09025v2#bib.bib34)) on spreadsheet data.

3 Method
--------

We propose a novel spreadsheet encoding framework in a Markdown-like style as text. To achieve a more compact and efficient representation, we introduce three independent yet combinable modules: structural-anchor-based extraction, inverted-index translation, and data-format-aware aggregation, which enable efficient data compression and enhance performance on downstream tasks.

### 3.1 Vanilla Spreadsheet Encoding with Cell Value, Address, and Format

Due to the absence of standardized practices in spreadsheet encoding for LLMs, we first explore traditional spreadsheet encoding methods. Appendix [B](https://arxiv.org/html/2407.09025v2#A2 "Appendix B Traditional Encoding Methods for Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") presents a comparison of different mainstream tabular data encoding methods, including HTML, XML, and Markdown. Based on the encoding length and performance on spreadsheet understanding tasks, we use a Markdown-like style representation:

𝒮={C⁢e⁢l⁢l i,j}i∈m,j∈n,𝒮 subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑚 𝑗 𝑛\displaystyle\mathcal{S}=\{Cell_{i,j}\}_{i\in m,j\in n},caligraphic_S = { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_i ∈ italic_m , italic_j ∈ italic_n end_POSTSUBSCRIPT ,(1)

𝒯 𝒯\displaystyle\mathcal{T}caligraphic_T=markdown⁢{encode⁢(C⁢e⁢l⁢l i,j)}absent markdown encode 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗\displaystyle=\mathrm{markdown}\left\{\mathrm{encode}\left(Cell_{i,j}\right)\right\}= roman_markdown { roman_encode ( italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT ) }
::\displaystyle::=``|A d d r e s s i,j,V a l u e i,j,F o r m a t|…∖n",\displaystyle=``|Address_{i,j},V\!alue_{i,j},F\!ormat|...\setminus\!n",= ` ` | italic_A italic_d italic_d italic_r italic_e italic_s italic_s start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT , italic_V italic_a italic_l italic_u italic_e start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT , italic_F italic_o italic_r italic_m italic_a italic_t | … ∖ italic_n " ,(2)

where 𝒮∈ℝ m,n 𝒮 superscript ℝ 𝑚 𝑛\mathcal{S}\in\mathbb{R}^{m,n}caligraphic_S ∈ blackboard_R start_POSTSUPERSCRIPT italic_m , italic_n end_POSTSUPERSCRIPT denotes the spreadsheet, 𝒯∈ℝ 1 𝒯 superscript ℝ 1\mathcal{T}\in\mathbb{R}^{1}caligraphic_T ∈ blackboard_R start_POSTSUPERSCRIPT 1 end_POSTSUPERSCRIPT denotes the text representation of a cell, and i 𝑖 i italic_i, j 𝑗 j italic_j, m 𝑚 m italic_m, n 𝑛 n italic_n respectively represent the row and column index of the cell and the row and column range of 𝒮 𝒮\mathcal{S}caligraphic_S. We also explored the inclusion of cell format information (such as background color, bold font, borders, etc.) into each cell’s representation. However, these experiments demonstrated that such detailed encoding adversely affects model performance due to rapid token limit exceedance and LLMs’ inadequate capability to process format information effectively, as detailed in Appendix [A](https://arxiv.org/html/2407.09025v2#A1 "Appendix A GPT4 Struggles to Understand Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). We plan to further explore this in future research, focusing on enhancing the model’s ability to understand and utilize format and structural cues.

### 3.2 Structural-anchor-based Extraction

Large spreadsheets often feature numerous homogeneous rows or columns, which minimally contribute to the understanding of their layout and structure, as depicted in Figure[2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") (a). To effectively compress spreadsheets while preserving vital layout and structural information, we propose a novel heuristic-based method, detailed further in Appendix [C](https://arxiv.org/html/2407.09025v2#A3 "Appendix C Lightweight Heuristics for Structural-anchor Proposal ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). This method identifies heterogeneous rows and columns at the edges of table boundaries—termed structural anchors:

𝒜={r p,c q}p∈m,q∈n,𝒜 subscript subscript 𝑟 𝑝 subscript 𝑐 𝑞 formulae-sequence 𝑝 𝑚 𝑞 𝑛\displaystyle\mathcal{A}=\left\{r_{p},c_{q}\right\}_{p\in m,q\in n},caligraphic_A = { italic_r start_POSTSUBSCRIPT italic_p end_POSTSUBSCRIPT , italic_c start_POSTSUBSCRIPT italic_q end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_p ∈ italic_m , italic_q ∈ italic_n end_POSTSUBSCRIPT ,(3)

where r p={C⁢e⁢l⁢l i,j}i=p,j∈n subscript 𝑟 𝑝 subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑝 𝑗 𝑛 r_{p}=\left\{Cell_{i,j}\right\}_{i=p,j\in n}italic_r start_POSTSUBSCRIPT italic_p end_POSTSUBSCRIPT = { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_i = italic_p , italic_j ∈ italic_n end_POSTSUBSCRIPT and c q={C⁢e⁢l⁢l i,j}i∈m,j=q subscript 𝑐 𝑞 subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑚 𝑗 𝑞 c_{q}=\left\{Cell_{i,j}\right\}_{i\in m,j=q}italic_c start_POSTSUBSCRIPT italic_q end_POSTSUBSCRIPT = { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_i ∈ italic_m , italic_j = italic_q end_POSTSUBSCRIPT. Using these anchor points, our method discards rows and columns that are located more than k 𝑘 k italic_k cells away from any anchor point, because they rarely serve as table boundaries. The parameter k 𝑘 k italic_k serves as a threshold to control the scope of neighborhood retention, effectively eliminating areas predominantly filled with homogeneous data that do not contribute to an understanding of the spreadsheet’s layout and structure. We explored the effects of different k 𝑘 k italic_k values in an ablation study, as detailed in Appendix [D.1](https://arxiv.org/html/2407.09025v2#A4.SS1 "D.1 Results on Structure-anchor Threshold ‣ Appendix D Ablation Experiment Results of Spreadsheet Table Detection ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

The extracted rows and columns can be expressed as:

𝒜+={r p+,c q+}p+∈m,q+∈n,subscript 𝒜 subscript subscript 𝑟 subscript 𝑝 subscript 𝑐 subscript 𝑞 formulae-sequence subscript 𝑝 𝑚 subscript 𝑞 𝑛\displaystyle\mathcal{A}_{+}=\left\{r_{p_{+}},c_{q_{+}}\right\}_{p_{+}\in m,q_% {+}\in n},caligraphic_A start_POSTSUBSCRIPT + end_POSTSUBSCRIPT = { italic_r start_POSTSUBSCRIPT italic_p start_POSTSUBSCRIPT + end_POSTSUBSCRIPT end_POSTSUBSCRIPT , italic_c start_POSTSUBSCRIPT italic_q start_POSTSUBSCRIPT + end_POSTSUBSCRIPT end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_p start_POSTSUBSCRIPT + end_POSTSUBSCRIPT ∈ italic_m , italic_q start_POSTSUBSCRIPT + end_POSTSUBSCRIPT ∈ italic_n end_POSTSUBSCRIPT ,(4)

where the extracted "skeletons" are defined as: r p+={C⁢e⁢l⁢l i,j}|i−p|≤k,j∈n subscript 𝑟 subscript 𝑝 subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑝 𝑘 𝑗 𝑛 r_{p_{+}}=\left\{Cell_{i,j}\right\}_{|i-p|\leq k,j\in n}italic_r start_POSTSUBSCRIPT italic_p start_POSTSUBSCRIPT + end_POSTSUBSCRIPT end_POSTSUBSCRIPT = { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT | italic_i - italic_p | ≤ italic_k , italic_j ∈ italic_n end_POSTSUBSCRIPT and c q+={C⁢e⁢l⁢l i,j}i∈m,|j−q|≤k subscript 𝑐 subscript 𝑞 subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑚 𝑗 𝑞 𝑘 c_{q_{+}}=\left\{Cell_{i,j}\right\}_{i\in m,|j-q|\leq k}italic_c start_POSTSUBSCRIPT italic_q start_POSTSUBSCRIPT + end_POSTSUBSCRIPT end_POSTSUBSCRIPT = { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_i ∈ italic_m , | italic_j - italic_q | ≤ italic_k end_POSTSUBSCRIPT. Then we obtain the extracted compact spreadsheet:

𝒮 e=extract⁢(𝒮)=address⁢_⁢map⁢(r p+∩c q+).subscript 𝒮 𝑒 extract 𝒮 address _ map subscript 𝑟 subscript 𝑝 subscript 𝑐 subscript 𝑞\displaystyle\mathcal{S}_{e}=\mathrm{extract}(\mathcal{S})=\mathrm{address\_% map}(r_{p_{+}}\!\cap c_{q_{+}}).caligraphic_S start_POSTSUBSCRIPT italic_e end_POSTSUBSCRIPT = roman_extract ( caligraphic_S ) = roman_address _ roman_map ( italic_r start_POSTSUBSCRIPT italic_p start_POSTSUBSCRIPT + end_POSTSUBSCRIPT end_POSTSUBSCRIPT ∩ italic_c start_POSTSUBSCRIPT italic_q start_POSTSUBSCRIPT + end_POSTSUBSCRIPT end_POSTSUBSCRIPT ) .(5)

Based on the compressed spreadsheet 𝒮 e subscript 𝒮 𝑒\mathcal{S}_{e}caligraphic_S start_POSTSUBSCRIPT italic_e end_POSTSUBSCRIPT, we can obtain extremely shorter text representation 𝒯 e subscript 𝒯 𝑒\mathcal{T}_{e}caligraphic_T start_POSTSUBSCRIPT italic_e end_POSTSUBSCRIPT. Furthermore, after extraction, we perform a coordinate re-mapping to ensure continuity in cell coordinates, preserving the integrity of data relationships within the compressed spreadsheet. This re-mapping is critical for maintaining the accuracy of prediction results, ensuring that analyses remain consistent even after compression. This method filters out 75% spreadsheet content but preserves 97% rows and columns at the edges of table boundaries.

### 3.3 Inverted-index Translation

Spreadsheets often contain numerous empty rows, columns, and scattered cells. The standard encoding method, as detailed in Section [3.1](https://arxiv.org/html/2407.09025v2#S3.SS1 "3.1 Vanilla Spreadsheet Encoding with Cell Value, Address, and Format ‣ 3 Method ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), employs a grid-based method that pairs cell addresses with their contents. This approach necessitates recording empty cells to maintain the spreadsheet’s two-dimensional structure, which significantly increases token consumption. Furthermore, cells with identical values are encoded repeatedly, exacerbating token usage.

To address these inefficiencies, we propose a two-stage Inverted-index-based Translation method. The first stage involves converting the traditional matrix-style encoding into a dictionary format, where cell values serve as keys indexing the addresses. In the second stage, cells sharing the same value are merged, with empty cells excluded and cell addresses noted as ranges. This method effectively reduces the number of required tokens by eliminating redundancies and simplifying the representation of repeated and empty cells. The translation process is represented mathematically as follows:

𝒯 t subscript 𝒯 𝑡\displaystyle\mathcal{T}_{t}caligraphic_T start_POSTSUBSCRIPT italic_t end_POSTSUBSCRIPT=invert⁢(𝒯)absent invert 𝒯\displaystyle=\mathrm{invert}(\mathcal{T})= roman_invert ( caligraphic_T )
::\displaystyle::={V⁢a⁢l⁢u⁢e:A⁢d⁢d⁢r⁢e⁢s⁢s⁢o⁢r⁢A⁢d⁢d⁢r⁢e⁢s⁢s⁢_⁢R⁢e⁢g⁢i⁢o⁢n,…}.absent conditional-set 𝑉 𝑎 𝑙 𝑢 𝑒 𝐴 𝑑 𝑑 𝑟 𝑒 𝑠 𝑠 𝑜 𝑟 𝐴 𝑑 𝑑 𝑟 𝑒 𝑠 𝑠 _ 𝑅 𝑒 𝑔 𝑖 𝑜 𝑛…\displaystyle=\text{$\left\{V\!alue:Address\;or\;Address\_Region,...\right\}$}.= { italic_V italic_a italic_l italic_u italic_e : italic_A italic_d italic_d italic_r italic_e italic_s italic_s italic_o italic_r italic_A italic_d italic_d italic_r italic_e italic_s italic_s _ italic_R italic_e italic_g italic_i italic_o italic_n , … } .(6)

Inverted-index Translation is a lossless compression method general for all spreadsheet understanding tasks, and it remarkably increases SheetCompressor’s compression ratio from 4.41 to 14.91. More details can be found in Table [1](https://arxiv.org/html/2407.09025v2#S4.T1 "Table 1 ‣ 4.2.1 Dataset ‣ 4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

### 3.4 Data-format-aware Aggregation

In spreadsheets, adjacent cells typically share the same data format. As shown in Figure [2](https://arxiv.org/html/2407.09025v2#S1.F2 "Figure 2 ‣ 1 Introduction ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") (3), column C records the sell-in billed revenue for different products. Nonetheless, the concrete numerical values are not essential for understanding the structure and semantics of the spreadsheet (although there might be a loss of fine-trained details of exact quantities, e.g., "18,476" and "18,674", this does not impact our comprehension that this column represents revenue). In contrast, the data type is critical for understanding spreadsheets. On one hand, data types represent fundamental semantic properties, such as "time" or "phone number". It motivates us to implement rules to match the value of the cell to different data types. On the other hand, in contrast to detailed numerical values, identical data types may be compressed through clustering, thereby reducing the number of tokens.

In this section, we introduce Data-format-aware Aggregation for further compression and information integration. Specifically, we employ Number Format String (NFS), which is a built-in cell attribute in spreadsheets. NFSs can be extracted by default using tools like ClosedXML or OpenPyXL, used to describe the format of cell data as a string. For instance, the NFS for "2024.2.14" is "yyyy-mm-dd", indicating a specific date format. However, spreadsheet users do not always explicitly add NFSs to cells, so NFSs are sometimes absent. As a complement, we propose a rule-based recognizer to map a cell value to a specific predefined data type: Year, Integer, Float, Percentage, Scientific notation, Date, Time, Currency, Email, and Others. The first nine types broadly cover approximately 55% of the cells in our dataset derived from real-world corpora. Finally, based on the NFSs and data type, the aggregator aggregates the cells by Algorithm[1](https://arxiv.org/html/2407.09025v2#algorithm1 "In M.1 Identical Cell Aggregation ‣ Appendix M Algorithm Steps ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). This process can be represented as follows:

N⁢F⁢S⁢s=nfs⁢({C⁢e⁢l⁢l i,j}i∈m,j∈n),𝑁 𝐹 𝑆 𝑠 nfs subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑚 𝑗 𝑛\displaystyle N\!F\!S\!s=\mathrm{nfs}(\left\{Cell_{i,j}\right\}_{i\in m,j\in n% }),italic_N italic_F italic_S italic_s = roman_nfs ( { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_i ∈ italic_m , italic_j ∈ italic_n end_POSTSUBSCRIPT ) ,(7)

𝒯 a=aggregator⁢({C⁢e⁢l⁢l i,j}i∈m,j∈n,N⁢F⁢S⁢s,R),subscript 𝒯 𝑎 aggregator subscript 𝐶 𝑒 𝑙 subscript 𝑙 𝑖 𝑗 formulae-sequence 𝑖 𝑚 𝑗 𝑛 𝑁 𝐹 𝑆 𝑠 𝑅\displaystyle\mathcal{T}_{a}=\mathrm{aggregator}(\left\{Cell_{i,j}\right\}_{i% \in m,j\in n},N\!F\!S\!s,R),caligraphic_T start_POSTSUBSCRIPT italic_a end_POSTSUBSCRIPT = roman_aggregator ( { italic_C italic_e italic_l italic_l start_POSTSUBSCRIPT italic_i , italic_j end_POSTSUBSCRIPT } start_POSTSUBSCRIPT italic_i ∈ italic_m , italic_j ∈ italic_n end_POSTSUBSCRIPT , italic_N italic_F italic_S italic_s , italic_R ) ,(8)

where R 𝑅 R italic_R denotes the predefined rules as detailed above. In this way, we further reduce the number of tokens. The compression ratio of the data regions also increases from 14.91 to 24.79. More detailed compression effects of different modules are displayed in Table [1](https://arxiv.org/html/2407.09025v2#S4.T1 "Table 1 ‣ 4.2.1 Dataset ‣ 4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

### 3.5 Chain of Spreadsheet

To extend the applicability of SpreadsheetLLM to a broader range of downstream tasks, we introduce the Chain of Spreadsheet (CoS), which unfolds two stages:

##### Table Identification and Boundary Detection

Initially, the compressed spreadsheet and the specific task query are input into the LLM. Leveraging the advances in spreadsheet table detection, the model identifies the table that is relevant to the query and determines the precise boundaries of the relevant content. This step ensures that only pertinent data is considered in the subsequent analysis, optimizing the processing efficiency and focus.

##### Response Generation

The query and the identified table section are re-inputted detected tables into the LLM. The model then processes this information to generate an accurate response to the query.

Through the CoS, SpreadsheetLLM effectively handles complex spreadsheets by breaking down the process into manageable parts, thus enabling precise and context-aware responses. In this paper, we validate the effect of the Spreadsheet QA task, which is detailed in Section [4.2](https://arxiv.org/html/2407.09025v2#S4.SS2 "4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

4 Experiments
-------------

In our experimental evaluation, we first verified the effectiveness of our method in spreadsheet understanding. For this purpose, we chose the classic and foundational task of spreadsheet table detection Dong et al. ([2019b](https://arxiv.org/html/2407.09025v2#bib.bib13)). This task serves as a critical benchmark for assessing the framework’s ability to accurately identify and interpret table structures within spreadsheets. Building upon this foundational understanding, we further explored the applicability of our method to downstream applications by selecting the representative task of spreadsheet QA. This allows us to test the model’s capability to not only detect but also comprehend and respond to user queries based on the data and structure identified in the spreadsheets.

### 4.1 Spreadsheet Table Detection

#### 4.1.1 Dataset

We used the dataset introduced by Dong et al. ([2019b](https://arxiv.org/html/2407.09025v2#bib.bib13)), a benchmark dataset of real-world spreadsheets with annotated table boundaries. Due to the complexity and ambiguity of precise address labeling (the Fleiss Kappa on the test set is 0.830), we further implemented the quality improvement pipeline on the test set by five human professionals, as detailed n in Appendix [E](https://arxiv.org/html/2407.09025v2#A5 "Appendix E Spreadsheet Table Detection Test Dataset Quality Improvement Pipeline ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). To this end, we obtained a highly validated test set containing 188 spreadsheets. Based on the token usage of the vanilla encoding method, we divided the test set into four categories: Small, Medium, Large, and Huge, with a partition of 64:32:70:22. More details are shown in Appendix [F](https://arxiv.org/html/2407.09025v2#A6 "Appendix F Spreadsheet Table Detection Test Dataset Partition ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). We adopted the Error-of-Boundary 0 (EoB-0) metric for evaluation on 188 spreadsheets with 311 tables. EoB-0 requires exact match of the top, left, bottom, and right boundaries.

#### 4.1.2 Experiment Setup

##### Baseline & Evaluation Metrics

To evaluate the performance of SpreadsheetLLM, we chose TableSense-CNN Dong et al. ([2019b](https://arxiv.org/html/2407.09025v2#bib.bib13)) as the baseline due to its previously demonstrated effectiveness in the spreadsheet table detection task. We employed the micro F1 Score as the primary metric to evaluate and compare the performance of different models, as it balances precision and recall, providing a holistic view of model accuracy.

##### Model Selection

The experiments included both closed-source and open-source models. From the closed-source spectrum, we selected two versions of OpenAI’s models: GPT4 and GPT3.5, which are known for their advanced language understanding capabilities. On the open-source side, we chose Llama2, Llama3, Phi3, and Mistral-v2. The specific configurations are detailed in Appendix [G](https://arxiv.org/html/2407.09025v2#A7 "Appendix G Experiment Setup ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

### 4.2 Spreadsheet QA

#### 4.2.1 Dataset

Existing datasets for the Table QA task focus solely on single-table scenarios, leaving a notable gap in performance evaluation for spreadsheets that contain multiple tables. To bridge this gap, we developed a new Spreadsheet QA dataset tailored to the complexities of multi-table environments. We sampled 64 spreadsheets from our larger collection and crafted 4-6 questions per spreadsheet, targeting fundamental operations such as searching, comparison, and basic arithmetic. We deliberately excluded questions involving composite operations to maintain clarity and focus in testing specific skills. Each question was paired with an answer, formatted either as a specific cell address or a formula that includes cell addresses, facilitating direct and unambiguous evaluations of the model’s ability to navigate and interpret spreadsheet data. This approach resulted in a comprehensive test dataset comprising 307 items, each a tuple of (Q,A,S)𝑄 𝐴 𝑆(Q,A,S)( italic_Q , italic_A , italic_S ), which is detailed in Appendix [H](https://arxiv.org/html/2407.09025v2#A8 "Appendix H Spreadsheet QA Test Dataset ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

Table 1: Average Compression Ratio on test datasets. Results of the train & valid set are shown in Appendix [J.1](https://arxiv.org/html/2407.09025v2#A10.SS1 "J.1 Compression Results ‣ Appendix J Other Experimental Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

#### 4.2.2 Experiment Setup

##### Baseline & Evaluation Metrics

Given that LLMs have not yet been systematically applied to Spreadsheet QA tasks, we have selected TaPEx and Binder Liu et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib30)); Cheng et al. ([2022](https://arxiv.org/html/2407.09025v2#bib.bib7)), which are established baselines in the Table QA domain, for comparative evaluation. Since TaPEx and Binder are designed primarily for single-table data, we adapted them for our multi-table context. Initially, our fine-tuned model identifies table regions relevant to each question. These regions are then formatted and fed into the baseline models. In cases where the input exceeds the token limitations of the baseline models, truncation is employed. The accuracy of the answers is assessed based on the correctness of the cell addresses and cell combinations/calculations provided in the answers.

##### Model Selection

Our experiments were conducted using the GPT4 model, leveraging its advanced capabilities in language understanding and reasoning. Details on parameters and configurations used are documented in Appendix [G](https://arxiv.org/html/2407.09025v2#A7 "Appendix G Experiment Setup ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

#### 4.2.3 Experiment Procedure

In this section, we employed the model fine-tuned on the spreadsheet table detection task to conduct QA experiments. In the QA experiments, we utilized the fine-tuned model on the table boundary detection task for spreadsheet QA as an ablation to study the generalization capability of the fine- tuned boundary detection model. CoS supports multi-step reasoning during the response generation process. In the QA scenarios, the whole steps include spreadsheet table detection, table structure understanding, table splitting, and sub-table QA. In cases where tables were exceptionally large and defy effective compression, we utilized a table-splitting algorithm designed to recognize headers and perform strategic concatenation, ensuring that each segment of the split table retains as much contextual integrity as possible. The specifics of this algorithm are detailed in Appendix [M.2](https://arxiv.org/html/2407.09025v2#A13.SS2 "M.2 Table Split QA Algorithm ‣ Appendix M Algorithm Steps ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). We categorically classify the model’s responses as either correct or incorrect, and we select accuracy as the evaluation metric.

5 Results
---------

### 5.1 Compression Ratio

The effectiveness of our encoding process in reducing the size of spreadsheet data is quantitatively assessed using the compression ratio, which is defined by the formula:

r=n/n′,𝑟 𝑛 superscript 𝑛′\displaystyle r=n/n^{\prime},italic_r = italic_n / italic_n start_POSTSUPERSCRIPT ′ end_POSTSUPERSCRIPT ,(9)

Our encoding methodology has significantly optimized token usage within spreadsheets. In our test set, it achieved an impressive 25×\times× compression ratio, substantially reducing the computational load for processing large datasets. The specific compression ratios achieved by various module combinations within SheetCompressor are detailed in Table [1](https://arxiv.org/html/2407.09025v2#S4.T1 "Table 1 ‣ 4.2.1 Dataset ‣ 4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). These results highlight the efficacy of our approach across different configurations, demonstrating its robustness and adaptability in handling diverse spreadsheet structures.

### 5.2 Spreadsheet Table Detection

Table 2: Results of various Model & Method configurations on spreadsheet table detection. Our encoding method achieved SOTA on the GPT4 model.

#### 5.2.1 Main Results

Table [2](https://arxiv.org/html/2407.09025v2#S5.T2 "Table 2 ‣ 5.2 Spreadsheet Table Detection ‣ 5 Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") illustrates the performance differences among various models and methods on spreadsheet table detection task, and the detailed case study can refer to Appendix [K](https://arxiv.org/html/2407.09025v2#A11 "Appendix K Case Study ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

1) Enhanced Performance with various LLMs: The fine-tuned GPT4 model achieved the F1 score of approximately 76% across all datasets, while our encoding method without aggregation achieved the F1 score of approximately 79% across all datasets. This marked a 27% improvement over the same model fine-tuned on original data, a 13% increase over TableSense-CNN, and established a new SOTA. The entire encoding method slightly reduced the F1 score within a tolerable range, but achieved good compression results, as shown in Table [1](https://arxiv.org/html/2407.09025v2#S4.T1 "Table 1 ‣ 4.2.1 Dataset ‣ 4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). We also evaluated our encoding method on a series of open-source models. Notably, Llama3 and Mistral-v2 achieved an F1 score of approximately 72%, just 6 percentage points below the SOTA. The improvements due to our compression method were substantial, with increases of 25% for Llama3, 36% for Phi3, 38% for Llama2, and 18% for Mistral-v2. These results underscored the significant enhancement performance attributable to our encoding method.

2) Benefits for Larger Spreadsheets: Our compression method significantly boosted performance on larger spreadsheets, where the challenges were most pronounced due to model token limits. The improvements in F1 scores were particularly notable on huge spreadsheets (75% over GPT4, 19% over TableSense-CNN), large spreadsheets (45% and 17%), medium (13% and 5%), and small (8%) spreadsheets. This demonstrated our method’s effectiveness in enabling LLMs to process a broader range of spreadsheet sizes efficiently.

3) Improvements in In-Context Learning: Compact encoding also significantly enhanced ICL capabilities. For instance, the performance of GPT4 on all data improved by nearly 26%, demonstrating the method’s effectiveness beyond fine-tuned models to include ICL scenarios as well. More ICL results are shown in Appendix [J.2](https://arxiv.org/html/2407.09025v2#A10.SS2 "J.2 The ICL results of open-source models on spreadsheet table detection. ‣ Appendix J Other Experimental Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

4) Significant Cost Reduction: Our cost was almost directly proportional to the input tokens, because the output table regions are short, which can be neglected. Based on the prices of the GPT4 and GPT3.5-turbo models 1 1 1 https://azure.microsoft.com/en-us/pricing/details/cognitive-services/openai-service/ in ICL, we reduced 96% cost in our test set. Detailed calculations are presented in Appendix [I](https://arxiv.org/html/2407.09025v2#A9 "Appendix I Cost calculation ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

#### 5.2.2 Ablation Experiment Results

Table 3: Ablation studies on spreadsheet table detection.

Table [3](https://arxiv.org/html/2407.09025v2#S5.T3 "Table 3 ‣ 5.2.2 Ablation Experiment Results ‣ 5.2 Spreadsheet Table Detection ‣ 5 Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") presents the results of ablation experiments for different modules. The removal of the extraction module led to significantly lower F1 scores, underscoring its critical role in capturing and retaining key structural information. As highlighted in Table [1](https://arxiv.org/html/2407.09025v2#S4.T1 "Table 1 ‣ 4.2.1 Dataset ‣ 4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), this module also achieved the most significant token reduction, confirming its effectiveness. After removing the aggregation module, the F1 score slightly increased. This observation might be attributed to the NFS being more abstract than straightforward numerical representations, which can challenge an LLM’s ability to interpret them effectively. Despite this, the NFS method offered a significantly high compression rate, enhancing its potential for practical applications and cost control.

### 5.3 Spreadsheet QA

Table 4: The results for Spreadsheet QA show that our method achieved SOTA. "-FT" means fine-tuned model on spreadsheet table detection task and is applied to QA.

Table [4](https://arxiv.org/html/2407.09025v2#S5.T4 "Table 4 ‣ 5.3 Spreadsheet QA ‣ 5 Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") shows the performance of various models on Spreadsheet QA tasks. We can draw the following conclusions: 1) Effectiveness of the CoS Method: The CoS method with SpreadsheetLLM significantly boosted the accuracy of models, showing a notable increase of 22% over the baseline GPT4 model. Given the large size of typical spreadsheets, directly inputting entire files often exceeded the token limits of conventional models. Some large tables even exceed the token limitation after compression. The CoS effectively addressed this issue by focusing only on regions relevant to the questions posed, improving accuracy by 3% and 5% on ICL and fine-tuning respectively.

In structural-anchor-based extraction, some information loss may occur, which could potentially affect downstream tasks. The CoS method was proposed to address this issue. Based on the overall understanding of the spreadsheet and the table detection, CoS identifies the related table and re-encodes it for downstream tasks without structural-anchor-based extraction. Additionally, the three modules proposed in SpreadsheetLLM are modular and can be freely chosen and used according to different tasks. For instance, the invert-index translation module does not result in any information loss and is almost applicable to all downstream tasks.

In the works of TaPEx and Binder that we referenced, tables are unlike spreadsheets, which can feature a multi-table layout, hundreds of rows (or even more), and formats such as merged cells that complicate the understanding of spatial information. To mitigate these challenges and enhance their capabilities on QA tasks, we have used tables detected in the spreadsheet that were related to the query as inputs. On the other hand, the address information of large tables in spreadsheets is crucial. In SpreadsheetLLM, we have augmented each cell with coordinate information. We speculate that if TaPEx’s pre-training had considered this setting, its performance might have further improved.

2) Generalization Capability of the Fine-tuned Model: The model that has been fine-tuned on the spreadsheet table detection task demonstrated robust generalization capabilities across downstream QA tasks. This fine-tuning on table detection led to an accuracy improvement of 6% on QA. Moreover, it significantly outperformed the TaPEx and Binder models by 37% and 12%, respectively. This substantial margin highlighted that fine-tuning not only prepared the model to better understand the specific data and structural nuances of spreadsheets but also enhanced its overall comprehension abilities.

6 Conclusion
------------

In this paper, we proposed the SpreadsheetLLM, a novel framework representing a significant advancement in the processing and understanding of spreadsheet data by leveraging the capabilities of LLMs. Through a novel encoding method, SheetCompressor, this framework effectively addresses the challenges posed by the size, diversity, and complexity inherent in spreadsheets. It achieves a substantial reduction in token usage and computational costs, enabling practical applications on large datasets. The fine-tuning of various cutting-edge LLMs further enhances the performance of spreadsheet understanding. Moreover, Chain of Spreadsheet, the framework’s extension to spreadsheet downstream tasks illustrates its broad applicability and potential to transform spreadsheet data management and analysis, paving the way for more intelligent and efficient user interactions.

Limitations
-----------

While SpreadsheetLLM has markedly advanced how LLMs interpret and utilize spreadsheets, they also illuminate areas ripe for further research and development. Currently, our methods do not yet harness spreadsheet format details such as background color and borders, because they take too many tokens. However, these elements often contain valuable contextual and visual cues that could further refine our understanding and processing of spreadsheet data. Additionally, while SheetCompressor effectively aggregates data regions, it does not currently employ a sophisticated semantic-based compression method for cells containing natural language. For example, categorizing terms like "China," "America," and "France" under a unified label such as "Country" could not only increase the compression ratio but also deepen the semantic understanding of the data by LLMs. Exploring these advanced semantic compression techniques will be a key focus of our ongoing efforts to enhance the capabilities of SpreadsheetLLM.

Ethics Statement
----------------

All data were collected, analyzed, and reported without any bias or influence from external sources. The privacy and confidentiality of the participants were strictly maintained throughout the research process. No personal identifiers were used in the analysis or reporting of the data to ensure anonymity. At the same time, data standard personnel were paid according to the highest local standard, and their daily working hours were strictly limited to no more than 8 hours to protect their legitimate rights and interests. We acknowledge the contributions of all individuals and institutions involved in this study and are committed to sharing our findings and methodologies transparently to facilitate further research and knowledge advancement in the field.

References
----------

*   Chen et al. (2024) Sibei Chen, Yeye He, Weiwei Cui, Ju Fan, Song Ge, Haidong Zhang, Dongmei Zhang, and Surajit Chaudhuri. 2024. Auto-formula: Recommend formulas in spreadsheets using contrastive learning for table representations. _arXiv preprint arXiv:2404.12608_. 
*   Chen et al. (2021) Xinyun Chen, Petros Maniatis, Rishabh Singh, Charles Sutton, Hanjun Dai, Max Lin, and Denny Zhou. 2021. Spreadsheetcoder: Formula prediction from semi-structured context. In _International Conference on Machine Learning_, pages 1661–1672. PMLR. 
*   Chen and Cafarella (2013) Zhe Chen and Michael Cafarella. 2013. Automatic web spreadsheet data extraction. In _Proceedings of the 3rd International Workshop on Semantic Search over the Web_, pages 1–8. 
*   Chen and Cafarella (2014) Zhe Chen and Michael Cafarella. 2014. Integrating spreadsheet data via accurate and low-effort extraction. In _Proceedings of the 20th ACM SIGKDD international conference on Knowledge discovery and data mining_, pages 1126–1135. 
*   Cheng et al. (2021a) Zhoujun Cheng, Haoyu Dong, Ran Jia, Pengfei Wu, Shi Han, Fan Cheng, and Dongmei Zhang. 2021a. Fortap: Using formulas for numerical-reasoning-aware table pretraining. _arXiv preprint arXiv:2109.07323_. 
*   Cheng et al. (2021b) Zhoujun Cheng, Haoyu Dong, Zhiruo Wang, Ran Jia, Jiaqi Guo, Yan Gao, Shi Han, Jian-Guang Lou, and Dongmei Zhang. 2021b. Hitab: A hierarchical table dataset for question answering and natural language generation. _arXiv preprint arXiv:2108.06712_. 
*   Cheng et al. (2022) Zhoujun Cheng, Tianbao Xie, Peng Shi, Chengzu Li, Rahul Nadkarni, Yushi Hu, Caiming Xiong, Dragomir Radev, Mari Ostendorf, Luke Zettlemoyer, et al. 2022. Binding language models in symbolic languages. _arXiv preprint arXiv:2210.02875_. 
*   Christodoulakis et al. (2020) Christina Christodoulakis, Eric B Munson, Moshe Gabel, Angela Demke Brown, and Renée J Miller. 2020. Pytheas: pattern-based table discovery in csv files. _Proceedings of the VLDB Endowment_, 13(12):2075–2089. 
*   Deng et al. (2024) Naihao Deng, Zhenjie Sun, Ruiqi He, Aman Sikka, Yulong Chen, Lin Ma, Yue Zhang, and Rada Mihalcea. 2024. Tables as images? exploring the strengths and limitations of llms on multimodal representations of tabular data. _arXiv preprint arXiv:2402.12424_. 
*   Deng et al. (2022) Xiang Deng, Huan Sun, Alyssa Lees, You Wu, and Cong Yu. 2022. Turl: Table understanding through representation learning. _ACM SIGMOD Record_, 51(1):33–40. 
*   Dong et al. (2022) Haoyu Dong, Zhoujun Cheng, Xinyi He, Mengyu Zhou, Anda Zhou, Fan Zhou, Ao Liu, Shi Han, and Dongmei Zhang. 2022. Table Pretraining: A survey on model architectures, pretraining objectives, and downstream tasks. _Proceedings of the Thirty-First International Joint Conference on Artificial Intelligence_. 
*   Dong et al. (2019a) Haoyu Dong, Shijie Liu, Zhouyu Fu, Shi Han, and Dongmei Zhang. 2019a. Semantic structure extraction for spreadsheet tables with a multi-task learning architecture. In _Workshop on Document Intelligence at NeurIPS 2019_. 
*   Dong et al. (2019b) Haoyu Dong, Shijie Liu, Shi Han, Zhouyu Fu, and Dongmei Zhang. 2019b. TableSense: Spreadsheet table detection with convolutional neural networks. In _Proceedings of the AAAI Conference on Artificial Intelligence_, volume 33, pages 69–76. 
*   Dong and Wang (2024) Haoyu Dong and Zhiruo Wang. 2024. Large language models for tabular data: Progresses and future directions. In _Proceedings of the 47th International ACM SIGIR Conference on Research and Development in Information Retrieval_, pages 2997–3000. 
*   Dou et al. (2018) Wensheng Dou, Shi Han, Liang Xu, Dongmei Zhang, and Jun Wei. 2018. Expandable group identification in spreadsheets. In _Proceedings of the 33rd ACM/IEEE International Conference on Automated Software Engineering_, pages 498–508. 
*   Dou et al. (2016) Wensheng Dou, Chang Xu, Shing-Chi Cheung, and Jun Wei. 2016. Cacheck: detecting and repairing cell arrays in spreadsheets. _IEEE Transactions on Software Engineering_, 43(3):226–251. 
*   Doush and Pontelli (2010) Iyad Abu Doush and Enrico Pontelli. 2010. Detecting and recognizing tables in spreadsheets. In _Proceedings of the 9th IAPR International Workshop on Document Analysis Systems_, pages 471–478. 
*   Gol et al. (2019) Majid Ghasemi Gol, Jay Pujara, and Pedro Szekely. 2019. Tabular cell classification using pre-trained cell embeddings. In _2019 IEEE International Conference on Data Mining (ICDM)_, pages 230–239. IEEE. 
*   He et al. (2024) Xinyi He, Mengyu Zhou, Xinrun Xu, Xiaojun Ma, Rui Ding, Lun Du, Yan Gao, Ran Jia, Xu Chen, Shi Han, et al. 2024. Text2analysis: A benchmark of table question answering with advanced data analysis and unclear queries. In _Proceedings of the AAAI Conference on Artificial Intelligence_, volume 38, pages 18206–18215. 
*   Hulsebos et al. (2019) Madelon Hulsebos, Kevin Hu, Michiel Bakker, Emanuel Zgraggen, Arvind Satyanarayan, Tim Kraska, Çagatay Demiralp, and César Hidalgo. 2019. Sherlock: A deep learning approach to semantic data type detection. In _Proceedings of the 25th ACM SIGKDD International Conference on Knowledge Discovery & Data Mining_, pages 1500–1508. 
*   Jiang et al. (2023a) Huiqiang Jiang, Qianhui Wu, Chin-Yew Lin, Yuqing Yang, and Lili Qiu. 2023a. Llmlingua: Compressing prompts for accelerated inference of large language models. _arXiv preprint arXiv:2310.05736_. 
*   Jiang et al. (2023b) Jinhao Jiang, Kun Zhou, Zican Dong, Keming Ye, Wayne Xin Zhao, and Ji-Rong Wen. 2023b. Structgpt: A general framework for large language model to reason over structured data. _arXiv preprint arXiv:2305.09645_. 
*   Jiang et al. (2022) Zhengbao Jiang, Yi Mao, Pengcheng He, Graham Neubig, and Weizhu Chen. 2022. Omnitab: Pretraining with natural and synthetic data for few-shot table-based question answering. _arXiv preprint arXiv:2207.03637_. 
*   Joshi et al. (2024) Harshit Joshi, Abishai Ebenezer, José Cambronero Sanchez, Sumit Gulwani, Aditya Kanade, Vu Le, Ivan Radiček, and Gust Verbruggen. 2024. Flame: A small language model for spreadsheet formulas. In _Proceedings of the AAAI Conference on Artificial Intelligence_, volume 38, pages 12995–13003. 
*   Li et al. (2023a) Hongxin Li, Jingran Su, et al. 2023a. SheetCopilot: Bringing Software Productivity to the Next Level through Large Language Models. In _NeurIPS_. 
*   Li et al. (2024) Peng Li, Yeye He, Cong Yan, Yue Wang, and Surajit Chaudhuri. 2024. Auto-tables: Relationalize tables without using examples. _ACM SIGMOD Record_, 53(1):76–85. 
*   Li et al. (2023b) Peng Li, Yeye He, Dror Yashar, Weiwei Cui, Song Ge, Haidong Zhang, Danielle Rifinski Fainman, Dongmei Zhang, and Surajit Chaudhuri. 2023b. Table-gpt: Table-tuned gpt for diverse table tasks. _arXiv preprint arXiv:2310.09263_. 
*   Li (2023) Yucheng Li. 2023. Unlocking context constraints of llms: Enhancing context efficiency of llms with self-information-based content filtering. _arXiv preprint arXiv:2304.12102_. 
*   Liu et al. (2024) Nelson F Liu, Kevin Lin, John Hewitt, Ashwin Paranjape, Michele Bevilacqua, Fabio Petroni, and Percy Liang. 2024. Lost in the middle: How language models use long contexts. _Transactions of the Association for Computational Linguistics_, 12:157–173. 
*   Liu et al. (2022) Qian Liu, Bei Chen, Jiaqi Guo, Morteza Ziyadi, Zeqi Lin, Weizhu Chen, and Jian-Guang Lou. 2022. Tapex: Table pre-training via learning a neural sql executor. _arXiv preprint arXiv:2107.07653_. 
*   Nishida et al. (2017) Kyosuke Nishida, Kugatsu Sadamitsu, Ryuichiro Higashinaka, and Yoshihiro Matsuo. 2017. Understanding the semantic structures of tables with a hybrid deep neural network architecture. In _Thirty-First AAAI Conference on Artificial Intelligence_. 
*   Pan et al. (2024) Zhuoshi Pan, Qianhui Wu, Huiqiang Jiang, Menglin Xia, Xufang Luo, Jue Zhang, Qingwei Lin, Victor Rühle, Yuqing Yang, Chin-Yew Lin, et al. 2024. Llmlingua-2: Data distillation for efficient and faithful task-agnostic prompt compression. _arXiv preprint arXiv:2403.12968_. 
*   Sui et al. (2023) Yuan Sui, Mengyu Zhou, Mingjie Zhou, Shi Han, and Dongmei Zhang. 2023. Gpt4table: Can large language models understand structured table data? a benchmark and empirical study. _arXiv preprint ArXiv:2305.13062_. 
*   Sui et al. (2024) Yuan Sui, Mengyu Zhou, Mingjie Zhou, Shi Han, and Dongmei Zhang. 2024. Table meets llm: Can large language models understand structured table data? a benchmark and empirical study. In _Proceedings of the 17th ACM International Conference on Web Search and Data Mining_, pages 645–654. 
*   Vitagliano et al. (2022) Gerardo Vitagliano, Lucas Reisener, Lan Jiang, Mazhar Hameed, and Felix Naumann. 2022. Mondrian: Spreadsheet layout detection. In _Proceedings of the 2022 International Conference on Management of Data_, pages 2361–2364. 
*   Wang and He (2019) Pei Wang and Yeye He. 2019. Uni-detect: A unified approach to automated error detection in tables. In _Proceedings of the 2019 International Conference on Management of Data_, pages 811–828. 
*   Wang et al. (2023) Tianshu Wang, Hongyu Lin, Xianpei Han, Le Sun, Xiaoyang Chen, Hao Wang, and Zhenyu Zeng. 2023. Dbcopilot: Scaling natural language querying to massive databases. _arXiv preprint arXiv:2312.03463_. 
*   Wang et al. (2021) Zhiruo Wang, Haoyu Dong, Ran Jia, Jia Li, Zhiyi Fu, Shi Han, and Dongmei Zhang. 2021. TUTA: Tree-based transformers for generally structured table pre-training. In _Proceedings of the 27th ACM SIGKDD Conference on Knowledge Discovery & Data Mining_, pages 1780–1790. 
*   Xia et al. (2024) Shiyu Xia, Junyu Xiong, Haoyu Dong, Jianbo Zhao, Yuzhang Tian, Mengyu Zhou, Yeye He, Shi Han, and Dongmei Zhang. 2024. Vision language models for spreadsheet understanding: Challenges and opportunities. _arXiv preprint arXiv:2405.16234_. 
*   Xu et al. (2023) Peng Xu, Wei Ping, Xianchao Wu, Lawrence McAfee, Chen Zhu, Zihan Liu, Sandeep Subramanian, Evelina Bakhturina, Mohammad Shoeybi, and Bryan Catanzaro. 2023. Retrieval meets long context large language models. _arXiv preprint arXiv:2310.03025_. 
*   Zhang et al. (2023) Tianshu Zhang, Xiang Yue, Yifei Li, and Huan Sun. 2023. Tablellama: Towards open large generalist models for tables. _arXiv preprint arXiv:2311.09206_. 
*   Zhang et al. (2024) Xiaokang Zhang, Jing Zhang, Zeyao Ma, Yang Li, Bohan Zhang, Guanlin Li, Zijun Yao, Kangli Xu, Jinchang Zhou, Daniel Zhang-Li, et al. 2024. Tablellm: Enabling tabular data manipulation by llms in real office usage scenarios. _arXiv preprint arXiv:2403.19318_. 
*   Zheng et al. (2023) Mingyu Zheng, Hao Yang, Wenbin Jiang, Zheng Lin, Yajuan Lyu, Qiaoqiao She, and Weiping Wang. 2023. [Chain-of-thought reasoning in tabular language models](https://doi.org/10.18653/v1/2023.findings-emnlp.734). pages 11006–11019. 

Appendix A GPT4 Struggles to Understand Spreadsheets
----------------------------------------------------

The Figure[3](https://arxiv.org/html/2407.09025v2#A1.F3 "Figure 3 ‣ Appendix A GPT4 Struggles to Understand Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") and Figure[4](https://arxiv.org/html/2407.09025v2#A1.F4 "Figure 4 ‣ Appendix A GPT4 Struggles to Understand Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") show how GPT4 struggles to understand spreadsheets. We also validated the effect of cell format on the vanilla encoding method on the spreadsheet table detection task. As shown in Table [5](https://arxiv.org/html/2407.09025v2#A1.T5 "Table 5 ‣ Appendix A GPT4 Struggles to Understand Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), the results indicate that in ICL, the inclusion of format marginally improves the model’s performance on small datasets but results in poorer performance on larger datasets. For the fine-tuned model, the inclusion of format information leads to a significant reduction in the overall F1 score. This decline is attributed to the introduction of additional tokens, which causes some data to exceed the model’s token limits. Additionally, LLMs are not yet adept at understanding format information.

![Image 3: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/GPT-4-1.png)

Figure 3: Challenges of GPT4 understanding spreadsheet data.

![Image 4: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/GPT-4-2.png)

Figure 4: GPT4 encoding methods and techniques for processing spreadsheet data.

Table 5: The results of spreadsheet table detection experiment with cell format.

Appendix B Traditional Encoding Methods for Spreadsheets
--------------------------------------------------------

In our study, we explored traditional encoding methods—Markdown, XML, and HTML—to represent spreadsheet data. Figure [5](https://arxiv.org/html/2407.09025v2#A2.F5 "Figure 5 ‣ Appendix B Traditional Encoding Methods for Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") illustrates the comparative analysis of these methods. XML and HTML encoding, while widely used, tend to result in high token consumption due to the extensive use of repeated label tags necessary for representing the data structure. This approach markedly increases the volume of data processed.

Conversely, the Markdown method, although more token-efficient, has its limitations. One significant drawback is the lack of explicit cell address information, which frequently leads to errors when indexing specific cell locations. Additionally, Markdown’s rigid structure rules complicate the accurate representation of merged cells, a common feature in complex spreadsheets that is crucial for preserving the integrity of data relationships.

To quantitatively assess these methods, we conducted ICL experiments using the GPT4 model on spreadsheet detection tasks. The results, detailed in Table [6](https://arxiv.org/html/2407.09025v2#A2.T6 "Table 6 ‣ Appendix B Traditional Encoding Methods for Spreadsheets ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), confirmed that while the Markdown method outperformed XML and HTML in terms of lower token usage, it still fell short in addressing the needs of spreadsheet encoding effectively.

![Image 5: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/traditional_enc.png)

Figure 5: Examples of three traditional spreadsheet encoding methods: Markdown, XML, and HTML. Due to space limitations, we only show the encoding of some cells.

Table 6: The ICL experiments of different encoding methods of the spreadsheet on GPT4.

Appendix C Lightweight Heuristics for Structural-anchor Proposal
----------------------------------------------------------------

Initially, this method enumerates bounding lines by finding discrepancies in neighboring rows and columns based on differences in cell values, merged cells, borders, and fill color. In other words, it enumerates rows and columns with imbalances (text, merge, border, color, font, etc.). Rows and columns without significant discrepancies are usually canonical data rows or columns that contribute trivially to the layout understanding of a spreadsheet. Subsequently, it composes all possible candidate boundaries using any two rows and any two columns as top/bottom/left/right edges. In the third step, heuristics are applied to filter unreasonable boundary candidates by judging the integrity within each candidate boundary. For example, the proportion of numbers and characters in each row and column is used to infer the sparsity in the internal region and four edges of the candidate boundary. The size of the boundary is used to infer if it is too small to be a table, and the presence of header-like rows and columns is also considered. After this step, a small proportion of candidate boundaries are preserved.

In the fourth step, overlapping candidate boundaries are enumerated pairwise. Information such as the relative positions of candidate boundaries and the presence of headers is used to determine which candidate boundary more likely represents a table, thereby filtering out some overlapping boundaries. Figure[6](https://arxiv.org/html/2407.09025v2#A3.F6 "Figure 6 ‣ Appendix C Lightweight Heuristics for Structural-anchor Proposal ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") presents common overlapping patterns. For example, for two overlapping candidate boundaries with close top boundaries, heuristics use the proportion of textual cells or format strings like year and date to determine candidate headers. The existence of candidate headers is then used to decide which candidate boundary to filter out.

Finally, we take the remaining candidate boundaries to derive structural anchors. However, due to the challenge of fine-grained discriminating headers, titles, and notes for heuristics, the candidate boundaries produced by the above heuristics only achieve 46.3% F1 score in EoB-0 metric and 65.0% EoB-2 metric in our boundary detection test set. Fortunately, including neighboring rows and columns largely increases the coverage of real bounding rows and columns, because headers, titles, and notes usually span few rows and columns. So we propose to not only use the exact bounding rows and columns as structural anchors but also include rows and columns within k 𝑘 k italic_k rows and columns neighboring the structural anchors to preserve titles, notes, and headers as much as possible. This allows LLMs to further determine the exact boundaries by leveraging their advanced capabilities in semantic understanding and reasoning. When k 𝑘 k italic_k is set to 4, over 97% of the border rows and columns in ground truth tables are preserved. This ensures that structure anchors rarely lose critical information about the table skeleton.

![Image 6: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/heu.png)

Figure 6: Common overlapping patterns of candidate boundaries. 

Appendix D Ablation Experiment Results of Spreadsheet Table Detection
---------------------------------------------------------------------

### D.1 Results on Structure-anchor Threshold

Table [7](https://arxiv.org/html/2407.09025v2#A4.T7 "Table 7 ‣ D.1 Results on Structure-anchor Threshold ‣ Appendix D Ablation Experiment Results of Spreadsheet Table Detection ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") details the ablation study concerning the number of rows and columns retained near candidate boundaries. Optimal results were observed when four rows/columns were preserved, yielding the highest F1 score across all datasets. This outcome is likely due to a balance between preserving essential boundary information and maintaining a feasible compression ratio. Retaining fewer rows/columns might omit critical boundaries, reducing Recall, while preserving more rows/columns diminishes the compression ratio, potentially exceeding the model’s token limits.

For smaller data, results indicate a positive correlation between the number of retained rows and the F1 score, suggesting that higher information retention leads to better model performance.

Table 7: Spreadsheet table detection Ablation on extracted threshold k 𝑘 k italic_k. We present experiment results of three different k 𝑘 k italic_k: 2, 4, and 8 on fine-tuned GPT4.

### D.2 Results of Spreadsheet Table Detection on ICL

We conducted experiments on the GPT4, "GPT4-0125-preview" version. As shown in Table [8](https://arxiv.org/html/2407.09025v2#A4.T8 "Table 8 ‣ D.2 Results of Spreadsheet Table Detection on ICL ‣ Appendix D Ablation Experiment Results of Spreadsheet Table Detection ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), the results are consistent with the conclusions we draw from our fine-tuned experiments.

Table 8: Ablation experiment results on ICL on spreadsheet table detection. Our compression method also achieved the best F1 score on ICL.

Appendix E Spreadsheet Table Detection Test Dataset Quality Improvement Pipeline
--------------------------------------------------------------------------------

The quality improvement pipeline on the test set consists of the following steps: (1) excluding those spreadsheets where at least one cell contains languages beyond English; (2) removing spreadsheets in the test set that lie in the same workbook as at least one spreadsheet in the training set, because spreadsheets in the same workbook, though different, are often similar; (3) annotating all spreadsheets in three types: type 1 means certain for one label; type 2 means multiple labels are reasonable; type 3 means not certain. We employ five well-educated annotators from top universities with majors in computer science to undertake this quality improvement. For each spreadsheet in the test set, we aggregate the annotations from all five annotators and preserve multiple reasonable labeling results for type 2 spreadsheets.

As a result, we obtained a well-annotated dataset with 167 spreadsheets containing 268 tables for type 1, 21 spreadsheets with 43 tables for type 2, and 10 spreadsheets for type 3. We selected data labeled as type 1 and type 2 as the test set, comprising a total of 188 entries.

Appendix F Spreadsheet Table Detection Test Dataset Partition
-------------------------------------------------------------

From the spreadsheet raw file, we can extract various features, including cell address, value, format (background color, bold, borders, etc.), and more. We transformed these features into the markdown-like style in Section[3.1](https://arxiv.org/html/2407.09025v2#S3.SS1 "3.1 Vanilla Spreadsheet Encoding with Cell Value, Address, and Format ‣ 3 Method ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"). Then, based on the number of tokens after encoding and the length of the context window of the test model, we divided them into four categories: small (number of tokens less than 4k), medium (4-8k), large (8-32k), and huge (greater than 32k). The following is an example of data in Markdown with format information.

Example: Encoding Spreadsheet in Markdown-like Style with Cell Formats{mdframed}[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true] Text Input: 

B2,Table 4: Diesel-driven passenger cars, 2015|C2, |D2, |E2, |F2, |G2, |H2, 

B3, |C3, |D3, |E3, |F3, |G3, |H3, 

B4, |C4, |D4, |E4, |F4, |G4, |H4, 

|B5, |C5,Diesel engine|D5, |E5, |F5,Share of all passenger cars (%)|G5, |H5,

……

Format Input:

|B2,Font Bold|C2, |D2, |E2, |F2, |G2, |H2, 

|B3, |C3, |D3, |E3, |F3, |G3, |H3, 

|B4,Bottom Border,|C4,Bottom Border,|D4,Bottom Border,|E4,Bottom Border,|F4,Bottom Border,|G4,Bottom Border,|H4,Bottom Border, 

|B5,Top Border,Right Border,Fill Color,Font Bold|C5,Top Border,Bottom Border,Left Border,Fill Color,Font Bold|D5,Top Border,Bottom Border,Fill Color,Font Bold|E5,Top Border,Bottom Border,Right Border,Fill Color,Font Bold|F5,Top Border,Bottom Border,Left Border,Fill Color,Font Bold|G5,Top Border,Bottom Border,Fill Color,Font Bold|H5,Top Border,Bottom Border,Fill Color,Font Bold 

……

Appendix G Experiment Setup
---------------------------

Open-source model using Deepspeed for distributed training on a workstation with 8 A100 GPUs by LoRA.

Llama2:meta-Llama/Llama-2-7b-chat-hf;

Llama3:meta-Llama/Meta-Llama-3-8B-Instruct;

Mistral-v2:mistralai/Mistral-v2-7B-Instruct-v0.2;

Phi3:microsoft/Phi-3-mini-128k-instruct;

##### The parameters of open-source model fine-tuning:

cutoff len=5800; learning rate=5e-05; num train epochs=15.0; train batch size=5; gradient accumulation steps=8; lr scheduler type is cosine; max grad norm=1.0; warmup steps=0; optim is AdamW; precision is fp16; lora rank=32; lora alpha=64; lora dropout=0.01; val size=0.0008; eval steps=50; eval batch size=5

##### The parameters of GPT4/3.5 model fine-tuning:

lora_dim=32,n_epochs=-1,batch_size=-1,learning_rate_multiplier=1,weight_decay_multiplier=1e-05,prompt_loss_weight=0,trim_mode=right.

##### The parameters of GPT4/3.5 model inference:

temperature=0, max tokens=300, top p=0.95, frequency penalty=0, presence penalty= 0, stop=None, and the rest are default settings.

Appendix H Spreadsheet QA Test Dataset
--------------------------------------

##### Overall Description

The dataset of 64 spreadsheets includes 9 single table spreadsheets, 35 double table spreadsheets, 11 spreadsheets containing three tables, and 9 spreadsheets containing four or more tables. Among them, 15 spreadsheets contain fewer than 4k tokens, 20 contain between 4k and 8k, 22 contain between 8k and 32k, and 7 contain more than 32k.

##### Details of the Dataset Collection

We selected English-language spreadsheets and invited five well-educated professional annotators to annotate the data. During selection, spreadsheets containing non-ASCII characters or lacking necessary semantic comprehension information were excluded. We ensured that the questions could be answered with relative certainty using the information provided in the tables, minimizing the potential confusion or ambiguity. To further validate the quality of the dataset, we invited two additional annotators to perform cross-verification after the initial question-answer labeling process, ensuring the correctness and rationality of the answers. It shows an answer accuracy of 0.846 in Fleiss Kappa, indicating almost perfect agreement.

Example: Spreadsheet QA Data Item

{mdframed}

[backgroundcolor=gray!20, linecolor=black, linewidth=1pt] QUESTION: "What were the highest temperatures in Washington DC in 1998?"

GROUNDTRUTH: "X23 AND X24"

PROMPT: [Instruction + Encoded Spreadsheet]

Appendix I Cost calculation
---------------------------

We use the ICL price of GPT4 due to the absence of fine-tuned GPT4’s price. We neglect the output sequence since it is much shorter than the input sequence in tasks like spreadsheet boundary detection and QA. The average cost of processing a spreadsheet in our test set has decreased by 96.0% for GPT3.5 turbo and GPT4, saving an impressive 96.0% in costs. The cost reduction similarly applies to all LLMs we used.

Appendix J Other Experimental Results
-------------------------------------

### J.1 Compression Results

Table [9](https://arxiv.org/html/2407.09025v2#A10.T9 "Table 9 ‣ J.1 Compression Results ‣ Appendix J Other Experimental Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") shows the compression ratio of each stage in our method relative to the previous stage.

Table 9: Compression Ratio of Data Region. 

Table [10](https://arxiv.org/html/2407.09025v2#A10.T10 "Table 10 ‣ J.1 Compression Results ‣ Appendix J Other Experimental Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") shows the total compression ratio of train and valid datasets.

Table 10: Compression performance on train & valid Datasets. 

### J.2 The ICL results of open-source models on spreadsheet table detection.

Table [11](https://arxiv.org/html/2407.09025v2#A10.T11 "Table 11 ‣ J.2 The ICL results of open-source models on spreadsheet table detection. ‣ Appendix J Other Experimental Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") shows the ICL experiments’ F1 score of open-source models on the spreadsheet table detection task. In this experimental setting, the open-source model performs far worse than the closed-source model.

Table 11: The ICL results of open-source models’ performance on spreadsheet table detection.

### J.3 Spreadsheet QA Ablation Experiment

Table 12: Each module of SheetCompressor contributes to the positive outcomes on Spreadsheet QA. "Answer" represents the accuracy of answering questions, and "Region" represents the accuracy of predicting relevant regions in CoS.

Table [12](https://arxiv.org/html/2407.09025v2#A10.T12 "Table 12 ‣ J.3 Spreadsheet QA Ablation Experiment ‣ Appendix J Other Experimental Results ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") assesses the impact of removing individual modules on the QA performance. It details both the overall accuracy and the accuracy of identifying question-related regions during the CoT process. The removal of any module generally leads to a decrease in both metrics, with the most significant drop observed when the extraction module is omitted. This is likely due to the extraction module achieving the lowest compression ratio (see Table [1](https://arxiv.org/html/2407.09025v2#S4.T1 "Table 1 ‣ 4.2.1 Dataset ‣ 4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models")), suggesting that a longer context may hinder the model’s ability to accurately interpret the data.

Appendix K Case Study
---------------------

### K.1 Comparison of results before and after structural-anchor-based extraction

![Image 7: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/case1.png)

Figure 7: The results before and after structural-anchor-based extraction. 

The case described in Figure.[7](https://arxiv.org/html/2407.09025v2#A11.F7 "Figure 7 ‣ K.1 Comparison of results before and after structural-anchor-based extraction ‣ Appendix K Case Study ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") illustrates the results of GPT4-FT before and after structural-anchor-based extraction. Specifically, before structural-anchor-based extraction, most of the content in the spreadsheet is concentrated in the first two rows and the three columns on the left and right, leaving the middle largely empty. This led GPT4 to incorrectly predict the presence of two tables, "B2:AK14" and "B19:F25." However, after applying structural-anchor-based extraction, the spreadsheet’s structure becomes more compact, making it easier for GPT4 to correctly predict the table’s range as "B2:M20" after coordinating rearrangement.

From this case, we can observe that for spreadsheets with sparse structures and many empty cells, structural-anchor-based extraction not only significantly reduces the number of tokens but also effectively enhances GPT4’s ability in table detection.

### K.2 Comparison of results before and after inverted-index translation

![Image 8: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/case2.png)

Figure 8: The results before and after inverted-index translation.

The case described in Figure.[8](https://arxiv.org/html/2407.09025v2#A11.F8 "Figure 8 ‣ K.2 Comparison of results before and after inverted-index translation ‣ Appendix K Case Study ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") demonstrates the results of GPT4-FT before and after inverted-index translation. Specifically, before the inverted-index translation, the spreadsheet contained two tables with identical column headers placed closely together, causing GPT4 to mistakenly predict them as one large table, "B1:D14." However, after inverted-index translation, GPT4 was able to aggregate cells with shared values, thereby recognizing semantic relationships between non-adjacent rows and columns. This enabled it to correctly identify the two separate tables in the spreadsheet, "B1:D10" and "B11:D14".

This case indicates that inverted-index translation, by aggregating cells with shared values, not only reduces token redundancy to some extent but also leverages the model’s robust understanding of semantic relationships.

### K.3 Comparison of results before and after data-format-aware cell aggregation

![Image 9: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/case3.png)

Figure 9: The results before and after data-aware cell aggregation.

The case presented in Figure.[9](https://arxiv.org/html/2407.09025v2#A11.F9 "Figure 9 ‣ K.3 Comparison of results before and after data-format-aware cell aggregation ‣ Appendix K Case Study ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models") showcases the results of GPT4-FT before and after data-aware cell aggregation. Specifically, before data-aware cell aggregation, the spreadsheet contained two columns with values of the same data type, occupying a large number of tokens. The first column increased incrementally by date, while the second column increased incrementally by value. After data-aware cell aggregation, the dates in the first column were replaced with the format string "yyyy/mm/dd" and their addresses were aggregated. Similarly, numerical values were handled with a "FloatNum" format. This method allowed the model to predict the table range correctly as "B1:C38," both before and after processing, indicating that this approach significantly reduces the token count while preserving the semantic information of the spreadsheet data.

### K.4 Comparison of SpreadsheetLLM and TableSense-CNN

![Image 10: Refer to caption](https://arxiv.org/html/2407.09025v2/extracted/6330978/fig/case_compare1.png)

Figure 10: A challenging case. Traditional spreadsheet understanding methods usually miss the region "R5:R14", but this column has a semantic relationship with the left cells, representing the percentage of those values in left cells.

As shown in Figure [10](https://arxiv.org/html/2407.09025v2#A11.F10 "Figure 10 ‣ K.4 Comparison of SpreadsheetLLM and TableSense-CNN ‣ Appendix K Case Study ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), the output of TableSense-CNN is [A1:G44,K5:M14,K16:M38,Q20:W29], while the output of SpreadsheetLLM is [A1:G44,K5:R 14,K16:M38,Q20:W29]. SpreadsheetLLM succeeds in adding the region "R5:R14" to the table2. Though it is spatially distant from the table on the left, SpreadsheetLLM can extract the connections from cells’ semantic and structural relationship, which demonstrates its powerful reasoning ability.

Appendix L Prompt Template
--------------------------

In this section, we present the prompt templates for the Spreadsheet Table Detection and Spreadsheet QA tasks.

### L.1 Vanilla Prompt Template for Spreadsheet Table Detection

A Vanilla Prompt Template for Spreadsheet Table Detection:{mdframed}[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true] INSTRUCTION:

Given an input that is a string denoting data of cells in a spreadsheet. The input spreadsheet includes many pairs, and each pair consists of a cell address and the text in that cell with a ’,’ in between, like ’A1,Year’. Cells are separated by ’|’ like ’A1,Year|A2,Profit’. The text can be empty so the cell data is like ’A1, |A2,Profit’. The cells are organized in row-major order. Now you should tell me the range of the table in a format like A2:D5, and the range of the table should only CONTAIN HEADER REGION and the data region, DON’T include the title or comments. Note that there can be more than one table in the string, so you should return all the RANGE, LIKE [’range’: ’A1:F9’, ’range’: ’A12:F18’]. DON’T ADD OTHER WORDS OR EXPLANATION.

INPUT:

[Encoded Spreadsheet]

### L.2 Prompt Template for Spreadsheet Table Detection

SpreadsheetLLM Prompt Template for Spreadsheet Table Detection:

{mdframed}

[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true] INSTRUCTION:

Given an input that is a string denoting data of cells in an Excel spreadsheet. The input spreadsheet contains many tuples, describing the cells with content in the spreadsheet. Each tuple consists of two elements separated by a ’|’: the cell content and the cell address/region, like (Year|A1), ( |A1) or (IntNum|A1:B3). The content in some cells such as ’#,##0’/’d-mmm-yy’/’H:mm:ss’,etc., represents the CELL DATA FORMATS of Excel. The content in some cells such as ’IntNum’/’DateData’/’EmailData’,etc., represents a category of data with the same format and similar semantics. For example, ’IntNum’ represents integer type data, and ’ScientificNum’ represents scientific notation type data. ’A1:B3’ represents a region in a spreadsheet, from the first row to the third row and from column A to column B. Some cells with empty content in the spreadsheet are not entered. Now you should tell me the range of the table in a format like A2:D5, and the range of the table should only CONTAIN HEADER REGION and the data region. DON’T include the title or comments. Note that there can be more than one table in a string, so you should return all the RANGE. {mdframed}[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true] DON’T ADD OTHER WORDS OR EXPLANATION.

INPUT:

[Encoded Spreadsheet]

### L.3 Prompt Template for Spreadsheet QA

As detailed in Section [4.2](https://arxiv.org/html/2407.09025v2#S4.SS2 "4.2 Spreadsheet QA ‣ 4 Experiments ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models"), the CoS method includes two stages, and the prompts for each stage are as follows:

Spreadsheet QA Prompt Template:

{mdframed}

[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true] Stage 1:

INSTRUCTION:

Given an input that is a string denoting data of cells in a table. The input table contains many tuples, describing the cells with content in the spreadsheet. Each tuple consists of two elements separated by a ’|’: the cell content and the cell address/region, like (Year|A1), ( |A1) or (IntNum|A1:B3). The content in some cells such as ’#,##0’/’d-mmm-yy’/’H:mm:ss’,etc., represents the CELL DATA FORMATS of Excel. The content in some cells such as ’IntNum’/’DateData’/’EmailData’,etc., represents a category of data with the same format and similar semantics. For example, ’IntNum’ represents integer type data, and ’ScientificNum’ represents scientific notation type data. ’A1:B3’ represents a region in a spreadsheet, from the first row to the third row and from column A to column B. Some cells with empty content in the spreadsheet are not entered. How many tables are there in the spreadsheet? Below is a question about one certain table in this spreadsheet. I need you to determine in which table the answer to the following question can be found, and return the RANGE of the ONE table you choose, LIKE [’range’: ’A1:F9’]. DON’T ADD OTHER WORDS OR EXPLANATION.

INPUT:

[Encoded Spreadsheet with compression]{mdframed}[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true]

Stage 2:

INSTRUCTION:

Given an input that is a string denoting data of cells in a table and a question about this table. The answer to the question can be found in the table. The input table includes many pairs,

{mdframed}

[backgroundcolor=gray!20, linecolor=black, linewidth=1pt, nobreak=true] and each pair consists of a cell address and the text in that cell with a ’,’ in between, like ’A1,Year’. Cells are separated by ’|’ like ’A1,Year|A2,Profit’. The text can be empty so the cell data is like ’A1, |A2,Profit’. The cells are organized in row-major order. The answer to the input question is contained in the input table and can be represented by cell address. I need you to find the cell address of the answer in the given table based on the given question description, and return the cell ADDRESS of the answer like ’[B3]’ or ’[SUM(A2:A10)]’. DON’T ADD ANY OTHER WORDS."

INPUT:

[Encoded Spreadsheet without compression]

Appendix M Algorithm Steps
--------------------------

### M.1 Identical Cell Aggregation

The corresponding algorithm steps are shown in Algorithm[1](https://arxiv.org/html/2407.09025v2#algorithm1 "In M.1 Identical Cell Aggregation ‣ Appendix M Algorithm Steps ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

Input :Matrix

n⁢f⁢s 𝑛 𝑓 𝑠 nfs italic_n italic_f italic_s
composed of all cell values in the spreadsheet.

1

2 Initialize

m 𝑚 m italic_m
and

n 𝑛 n italic_n
as the number of matrix

i⁢n⁢p⁢u⁢t 𝑖 𝑛 𝑝 𝑢 𝑡 input italic_i italic_n italic_p italic_u italic_t
rows and columns.

3 Initialize the

m×n 𝑚 𝑛 m\times n italic_m × italic_n
matrix

v⁢i⁢s⁢i⁢t⁢e⁢d 𝑣 𝑖 𝑠 𝑖 𝑡 𝑒 𝑑 visited italic_v italic_i italic_s italic_i italic_t italic_e italic_d
with all values set to

F⁢a⁢l⁢s⁢e 𝐹 𝑎 𝑙 𝑠 𝑒 False italic_F italic_a italic_l italic_s italic_e
.

4 Initialize

a⁢r⁢e⁢a⁢s 𝑎 𝑟 𝑒 𝑎 𝑠 areas italic_a italic_r italic_e italic_a italic_s
as an empty list.

5 Initialize the

F⁢o⁢r⁢m⁢a⁢t⁢D⁢i⁢c⁢t 𝐹 𝑜 𝑟 𝑚 𝑎 𝑡 𝐷 𝑖 𝑐 𝑡 FormatDict italic_F italic_o italic_r italic_m italic_a italic_t italic_D italic_i italic_c italic_t
dictionary, the key-value pairs are data values and predefined types respectively.

6 Function _dfs(\_r, c, val\\_type\_)_:

7 if _v i s i t e d[r][c])∨v a l \_ t y p e!=FormatDict[n f s[r,c]]visited[r][c])\lor val\\_type!=\text{FormatDict}[nfs[r,c]]italic\_v italic\_i italic\_s italic\_i italic\_t italic\_e italic\_d [ italic\_r ] [ italic\_c ] ) ∨ italic\_v italic\_a italic\_l \_ italic\_t italic\_y italic\_p italic\_e ! = FormatDict [ italic\_n italic\_f italic\_s [ italic\_r , italic\_c ] ]_ then

8 return

[r,c,r−1,c−1]𝑟 𝑐 𝑟 1 𝑐 1[r,c,r-1,c-1][ italic_r , italic_c , italic_r - 1 , italic_c - 1 ]
;

9

10

v⁢i⁢s⁢i⁢t⁢e⁢d⁢[r]⁢[c]←True←𝑣 𝑖 𝑠 𝑖 𝑡 𝑒 𝑑 delimited-[]𝑟 delimited-[]𝑐 True visited[r][c]\leftarrow\text{True}italic_v italic_i italic_s italic_i italic_t italic_e italic_d [ italic_r ] [ italic_c ] ← True
;

11

b⁢o⁢u⁢n⁢d⁢s←[r,c,r,c]←𝑏 𝑜 𝑢 𝑛 𝑑 𝑠 𝑟 𝑐 𝑟 𝑐 bounds\leftarrow[r,c,r,c]italic_b italic_o italic_u italic_n italic_d italic_s ← [ italic_r , italic_c , italic_r , italic_c ]
;

12 foreach _(tr, tc) around (r, c)_ do

13 if _¬v i s i t e d[t r][t c])∧v a l \_ t y p e==FormatDict[n f s[t r,t c]]\neg visited[tr][tc])\land val\\_type==\text{FormatDict}[nfs[tr,tc]]¬ italic\_v italic\_i italic\_s italic\_i italic\_t italic\_e italic\_d [ italic\_t italic\_r ] [ italic\_t italic\_c ] ) ∧ italic\_v italic\_a italic\_l \_ italic\_t italic\_y italic\_p italic\_e = = FormatDict [ italic\_n italic\_f italic\_s [ italic\_t italic\_r , italic\_t italic\_c ] ]_ then

14

n⁢e⁢w⁢_⁢b⁢o⁢u⁢n⁢d⁢s←dfs⁢(t⁢r,t⁢c,v⁢a⁢l⁢_⁢t⁢y⁢p⁢e)←𝑛 𝑒 𝑤 _ 𝑏 𝑜 𝑢 𝑛 𝑑 𝑠 dfs 𝑡 𝑟 𝑡 𝑐 𝑣 𝑎 𝑙 _ 𝑡 𝑦 𝑝 𝑒 new\_bounds\leftarrow\text{dfs}(tr,tc,val\_type)italic_n italic_e italic_w _ italic_b italic_o italic_u italic_n italic_d italic_s ← dfs ( italic_t italic_r , italic_t italic_c , italic_v italic_a italic_l _ italic_t italic_y italic_p italic_e )
;

15 update bounds to include new_bounds;

16

17

18 return bounds;

19

20

21 for _r=0 𝑟 0 r=0 italic\_r = 0 to m−1 𝑚 1 m-1 italic\_m - 1_ do

22 for _c=0 𝑐 0 c=0 italic\_c = 0 to n−1 𝑛 1 n-1 italic\_n - 1_ do

23 if _¬v⁢i⁢s⁢i⁢t⁢e⁢d⁢[r]⁢[c]𝑣 𝑖 𝑠 𝑖 𝑡 𝑒 𝑑 delimited-[]𝑟 delimited-[]𝑐\neg visited[r][c]¬ italic\_v italic\_i italic\_s italic\_i italic\_t italic\_e italic\_d [ italic\_r ] [ italic\_c ]_ then

24

v⁢a⁢l⁢_⁢t⁢y⁢p⁢e←FormatDict⁢[n⁢f⁢s⁢[r,c]]←𝑣 𝑎 𝑙 _ 𝑡 𝑦 𝑝 𝑒 FormatDict delimited-[]𝑛 𝑓 𝑠 𝑟 𝑐 val\_type\leftarrow\text{FormatDict}[nfs[r,c]]italic_v italic_a italic_l _ italic_t italic_y italic_p italic_e ← FormatDict [ italic_n italic_f italic_s [ italic_r , italic_c ] ]
;

25

b⁢o⁢u⁢n⁢d⁢s←dfs⁢(r,c,v⁢a⁢l⁢_⁢t⁢y⁢p⁢e)←𝑏 𝑜 𝑢 𝑛 𝑑 𝑠 dfs 𝑟 𝑐 𝑣 𝑎 𝑙 _ 𝑡 𝑦 𝑝 𝑒 bounds\leftarrow\text{dfs}(r,c,val\_type)italic_b italic_o italic_u italic_n italic_d italic_s ← dfs ( italic_r , italic_c , italic_v italic_a italic_l _ italic_t italic_y italic_p italic_e )
;

26

a r e a s←a r e a s+((b o u n d s[0],b o u n d s[1]),areas\leftarrow areas+((bounds[0],bounds[1]),italic_a italic_r italic_e italic_a italic_s ← italic_a italic_r italic_e italic_a italic_s + ( ( italic_b italic_o italic_u italic_n italic_d italic_s [ 0 ] , italic_b italic_o italic_u italic_n italic_d italic_s [ 1 ] ) ,

27

(b⁢o⁢u⁢n⁢d⁢s⁢[2],b⁢o⁢u⁢n⁢d⁢s⁢[3]),𝑏 𝑜 𝑢 𝑛 𝑑 𝑠 delimited-[]2 𝑏 𝑜 𝑢 𝑛 𝑑 𝑠 delimited-[]3\ (bounds[2],bounds[3]),( italic_b italic_o italic_u italic_n italic_d italic_s [ 2 ] , italic_b italic_o italic_u italic_n italic_d italic_s [ 3 ] ) ,

28

v a l _ t y p e);\ val\_type);italic_v italic_a italic_l _ italic_t italic_y italic_p italic_e ) ;

29

30

31

Output :Aggregation matrix

a⁢r⁢e⁢a⁢s 𝑎 𝑟 𝑒 𝑎 𝑠 areas italic_a italic_r italic_e italic_a italic_s
, each cell which is filled with the corresponding datatype after applying custom rules.

32

Algorithm 1 Identical Cell Aggregation

### M.2 Table Split QA Algorithm

The corresponding algorithm steps are shown in Algorithm[2](https://arxiv.org/html/2407.09025v2#algorithm2 "In M.2 Table Split QA Algorithm ‣ Appendix M Algorithm Steps ‣ SpreadsheetLLM: Encoding Spreadsheets for Large Language Models").

1

Input :

q⁢u⁢e⁢s⁢t⁢i⁢o⁢n 𝑞 𝑢 𝑒 𝑠 𝑡 𝑖 𝑜 𝑛 question italic_q italic_u italic_e italic_s italic_t italic_i italic_o italic_n
composed of strings and two-dimensional matrix

r⁢e⁢g⁢i⁢o⁢n 𝑟 𝑒 𝑔 𝑖 𝑜 𝑛 region italic_r italic_e italic_g italic_i italic_o italic_n

2

3 Initialize

h⁢e⁢a⁢d⁢e⁢r ℎ 𝑒 𝑎 𝑑 𝑒 𝑟 header italic_h italic_e italic_a italic_d italic_e italic_r
and

a⁢n⁢s⁢w⁢e⁢r⁢s 𝑎 𝑛 𝑠 𝑤 𝑒 𝑟 𝑠 answers italic_a italic_n italic_s italic_w italic_e italic_r italic_s
to empty lists

4 if _c⁢a⁢l⁢c⁢u⁢l⁢a⁢t⁢e⁢T⁢o⁢k⁢e⁢n⁢s⁢(r⁢e⁢g⁢i⁢o⁢n)≤4096 𝑐 𝑎 𝑙 𝑐 𝑢 𝑙 𝑎 𝑡 𝑒 𝑇 𝑜 𝑘 𝑒 𝑛 𝑠 𝑟 𝑒 𝑔 𝑖 𝑜 𝑛 4096 calculateTokens(region)\leq 4096 italic\_c italic\_a italic\_l italic\_c italic\_u italic\_l italic\_a italic\_t italic\_e italic\_T italic\_o italic\_k italic\_e italic\_n italic\_s ( italic\_r italic\_e italic\_g italic\_i italic\_o italic\_n ) ≤ 4096_ then

5 return answer_question(question, region);

6

7 else

8

h⁢e⁢a⁢d⁢e⁢r←p⁢r⁢e⁢d⁢i⁢c⁢t⁢_⁢h⁢e⁢a⁢d⁢e⁢r⁢(r⁢e⁢g⁢i⁢o⁢n)←ℎ 𝑒 𝑎 𝑑 𝑒 𝑟 𝑝 𝑟 𝑒 𝑑 𝑖 𝑐 𝑡 _ ℎ 𝑒 𝑎 𝑑 𝑒 𝑟 𝑟 𝑒 𝑔 𝑖 𝑜 𝑛 header\leftarrow predict\_header(region)italic_h italic_e italic_a italic_d italic_e italic_r ← italic_p italic_r italic_e italic_d italic_i italic_c italic_t _ italic_h italic_e italic_a italic_d italic_e italic_r ( italic_r italic_e italic_g italic_i italic_o italic_n )
;

9

b o d y←r e g i o n[l e n g t h(h e a d e r)+1:e n d]body\leftarrow region[length(header)+1:end]italic_b italic_o italic_d italic_y ← italic_r italic_e italic_g italic_i italic_o italic_n [ italic_l italic_e italic_n italic_g italic_t italic_h ( italic_h italic_e italic_a italic_d italic_e italic_r ) + 1 : italic_e italic_n italic_d ]
;

10

11 for _i=0 𝑖 0 i=0 italic\_i = 0 to l⁢e⁢n⁢g⁢t⁢h⁢(b⁢o⁢d⁢y)𝑙 𝑒 𝑛 𝑔 𝑡 ℎ 𝑏 𝑜 𝑑 𝑦 length(body)italic\_l italic\_e italic\_n italic\_g italic\_t italic\_h ( italic\_b italic\_o italic\_d italic\_y )_ do

12

n e w _ t a b l e←h e a d e r+b o d y[i:i+3]new\_table\leftarrow header+body[i:i+3]italic_n italic_e italic_w _ italic_t italic_a italic_b italic_l italic_e ← italic_h italic_e italic_a italic_d italic_e italic_r + italic_b italic_o italic_d italic_y [ italic_i : italic_i + 3 ]
;

13

a⁢n⁢s⁢w⁢e⁢r←a⁢n⁢s⁢w⁢e⁢r⁢_⁢q⁢u⁢e⁢s⁢t⁢i⁢o⁢n⁢(q⁢u⁢e⁢s⁢t⁢i⁢o⁢n,t⁢a⁢b⁢l⁢e)←𝑎 𝑛 𝑠 𝑤 𝑒 𝑟 𝑎 𝑛 𝑠 𝑤 𝑒 𝑟 _ 𝑞 𝑢 𝑒 𝑠 𝑡 𝑖 𝑜 𝑛 𝑞 𝑢 𝑒 𝑠 𝑡 𝑖 𝑜 𝑛 𝑡 𝑎 𝑏 𝑙 𝑒 answer\leftarrow answer\_question(question,table)italic_a italic_n italic_s italic_w italic_e italic_r ← italic_a italic_n italic_s italic_w italic_e italic_r _ italic_q italic_u italic_e italic_s italic_t italic_i italic_o italic_n ( italic_q italic_u italic_e italic_s italic_t italic_i italic_o italic_n , italic_t italic_a italic_b italic_l italic_e )
;

14

a⁢n⁢s⁢w⁢e⁢r⁢s.a⁢p⁢p⁢e⁢n⁢d⁢(a⁢n⁢s⁢w⁢e⁢r)formulae-sequence 𝑎 𝑛 𝑠 𝑤 𝑒 𝑟 𝑠 𝑎 𝑝 𝑝 𝑒 𝑛 𝑑 𝑎 𝑛 𝑠 𝑤 𝑒 𝑟 answers.append(answer)italic_a italic_n italic_s italic_w italic_e italic_r italic_s . italic_a italic_p italic_p italic_e italic_n italic_d ( italic_a italic_n italic_s italic_w italic_e italic_r )
;

15

16

Output :final result

a⁢n⁢s⁢w⁢e⁢r⁢s 𝑎 𝑛 𝑠 𝑤 𝑒 𝑟 𝑠 answers italic_a italic_n italic_s italic_w italic_e italic_r italic_s

Algorithm 2 Question Answering Process for Large Tables
